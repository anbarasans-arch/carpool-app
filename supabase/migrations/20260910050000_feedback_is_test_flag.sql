-- Marks feedback rows inserted directly via SQL for testing (e.g. to verify
-- the weekly digest's HTML-escaping) so they never appear in the real
-- digest email. The in-app popup never sets this - it always defaults to
-- false - so genuine user feedback is unaffected.
alter table public.feedback add column is_test boolean not null default false;

create or replace function public.send_weekly_feedback_digest()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  anthropic_key text;
  feedback_count int;
  feedback_text text;
  claude_request_id bigint;
  claude_response text;
  claude_status int;
  summary_text text;
  attempts int := 0;
  email_html text;
begin
  select count(*), string_agg(
    format('- [%s] %s: %s',
      to_char(f.created_at, 'Mon DD, HH24:MI'),
      u.email,
      f.message
    ),
    E'\n\n' order by f.created_at
  )
  into feedback_count, feedback_text
  from public.feedback f
  join public.users u on u.id = f.user_id
  where f.created_at > now() - interval '7 days'
    and not f.is_test;

  feedback_count := coalesce(feedback_count, 0);

  if feedback_count = 0 then
    summary_text := 'No feedback was submitted this week.';
  else
    select decrypted_secret into anthropic_key from vault.decrypted_secrets where name = 'anthropic_api_key';

    if anthropic_key is null then
      summary_text := '(ANTHROPIC_API_KEY not set in vault - showing raw feedback instead of a synthesized summary)'
        || E'\n\n' || feedback_text;
    else
      claude_request_id := net.http_post(
        url := 'https://api.anthropic.com/v1/messages',
        headers := jsonb_build_object(
          'x-api-key', anthropic_key,
          'anthropic-version', '2023-06-01',
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'model', 'claude-sonnet-5',
          'max_tokens', 1024,
          'messages', jsonb_build_array(
            jsonb_build_object(
              'role', 'user',
              'content', 'You are helping the solo builder of an internal carpool-matching app review a week of user feedback. Read the feedback below and write a concise, consolidated list of next actions - grouped by theme, prioritized by how many people mentioned something or how serious it sounds. Reference what users actually said. Plain text, no markdown headers needed. Feedback (' || feedback_count || ' submission(s) this week):' || E'\n\n' || feedback_text
            )
          )
        ),
        timeout_milliseconds := 45000
      );

      loop
        select content, status_code into claude_response, claude_status
        from net._http_response where id = claude_request_id;
        exit when claude_response is not null or attempts >= 30;
        perform pg_sleep(1);
        attempts := attempts + 1;
      end loop;

      if claude_response is null then
        summary_text := '(Claude API did not respond in time - showing raw feedback instead)' || E'\n\n' || feedback_text;
      elsif claude_status <> 200 then
        summary_text := format('(Claude API returned status %s - showing raw feedback instead)', claude_status)
          || E'\n\n' || feedback_text;
      else
        summary_text := claude_response::jsonb -> 'content' -> 0 ->> 'text';
        if summary_text is null then
          summary_text := '(Could not parse Claude response - showing raw feedback instead)' || E'\n\n' || feedback_text;
        end if;
      end if;
    end if;
  end if;

  email_html := format(
    '<h2>Weekly carpool feedback digest</h2>'
    || '<p style="color:#666;font-size:13px;">%s submission(s) in the last 7 days.</p>'
    || '<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;">%s</pre>',
    feedback_count,
    public.escape_html(summary_text)
  );

  perform public.send_transactional_email(
    'anbarasan.santhalingam@gmail.com',
    format('Carpool feedback digest - %s new this week', feedback_count),
    email_html
  );
end;
$$;
