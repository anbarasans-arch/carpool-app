import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  selectedDates: string[]; // 'YYYY-MM-DD', local calendar date
  onChange: (dates: string[]) => void;
  weeksAhead?: number;
};

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Lets a driver/rider tap every specific date they carpool - directly
// handles alternating-week patterns (or any custom pattern) since dates are
// picked individually rather than through an abstract recurrence rule.
// Renders as calendar-aligned week rows so the pattern (e.g. "every other
// Monday") is visually obvious while picking.
export default function MultiDatePicker({ label, selectedDates, onChange, weeksAhead = 8 }: Props) {
  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earliestSelectable = new Date(today);
    earliestSelectable.setDate(earliestSelectable.getDate() + 1);

    const firstDay = new Date(earliestSelectable);
    firstDay.setDate(firstDay.getDate() - firstDay.getDay());

    const days: { date: Date; key: string; disabled: boolean }[] = [];
    for (let i = 0; i < weeksAhead * 7; i++) {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + i);
      days.push({ date, key: toDateKey(date), disabled: date < earliestSelectable });
    }

    const rows: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [weeksAhead]);

  function toggle(key: string, disabled: boolean) {
    if (disabled) return;
    onChange(
      selectedDates.includes(key)
        ? selectedDates.filter((k) => k !== key)
        : [...selectedDates, key].sort(),
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>
        {selectedDates.length === 0
          ? 'Tap every date that applies.'
          : `${selectedDates.length} date${selectedDates.length === 1 ? '' : 's'} selected`}
      </Text>
      <View style={styles.weekHeader}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          <Text key={i} style={styles.weekHeaderText}>
            {letter}
          </Text>
        ))}
      </View>
      {weeks.map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((day) => {
            const selected = selectedDates.includes(day.key);
            return (
              <Pressable
                key={day.key}
                style={[styles.day, day.disabled && styles.dayDisabled, selected && styles.daySelected]}
                onPress={() => toggle(day.key, day.disabled)}
                disabled={day.disabled}
              >
                <Text
                  style={[
                    styles.dayText,
                    day.disabled && styles.dayTextDisabled,
                    selected && styles.dayTextSelected,
                  ]}
                >
                  {day.date.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 480,
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  weekHeader: {
    flexDirection: 'row',
  },
  weekHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
  },
  week: {
    flexDirection: 'row',
    gap: 4,
  },
  day: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginVertical: 2,
  },
  dayDisabled: {
    opacity: 0.25,
  },
  daySelected: {
    backgroundColor: '#111',
  },
  dayText: {
    fontSize: 13,
    color: '#333',
  },
  dayTextDisabled: {
    color: '#999',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
});
