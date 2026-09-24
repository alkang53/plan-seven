import DateTimePicker from '@react-native-community/datetimepicker';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addRecurringTodos, addTodo } from '../storage/todoStorage';
import { styles } from '../styles/appStyles';
import {
  DEFAULT_TODO_TAG,
  TODO_TAG_ICONS,
  TODO_TAG_LABELS,
  TODO_TAGS,
  type Todo,
  type TodoTag,
  type RecurrenceFrequency,
} from '../types/todo';
import { dateFromKey, formatDate, formatTime } from '../utils/date';
import { addWeeks, getWeek, toDateKey } from '../utils/week';

type Props = {
  initialDate: string;
  onClose: () => void;
  onCreated: (todos: Todo[]) => void;
};

export function TodoForm({ initialDate, onClose, onCreated }: Props) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState<Date | null>(null);
  const [tag, setTag] = useState<TodoTag>(DEFAULT_TODO_TAG);
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('daily');
  const [endDate, setEndDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const earliestAllowedDate = addWeeks(getWeek().monday, -1);
  const maxEndDate = new Date(dateFromKey(date));
  maxEndDate.setMonth(maxEndDate.getMonth() + 3);
  const formScrollRef = useRef<ScrollView | null>(null);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Görev başlığı gerekli.');
      requestAnimationFrame(() => formScrollRef.current?.scrollTo({ animated: true, y: 0 }));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const input = {
        date,
        title: trimmedTitle,
        time: time ? formatTime(time) : null,
        tag,
        completed: false,
      };
      const todos = recurring
        ? await addRecurringTodos(input, frequency, endDate ?? toDateKey(maxEndDate))
        : [await addTodo(input)];
      onCreated(todos);
    } catch {
      setError('Görev kaydedilemedi. Lütfen tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
      <ScrollView
        ref={formScrollRef}
        contentContainerStyle={styles.modalScrollContent}
        keyboardShouldPersistTaps="handled"
        style={styles.modalScroll}
      >
      <View style={[styles.modalCard, { paddingBottom: 26 + insets.bottom }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Planına Ekle</Text>
          <Pressable accessibilityLabel="Görev ekleme penceresini kapat" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>Başlık</Text>
        <TextInput
          autoFocus
          editable={!saving}
          maxLength={120}
          onChangeText={setTitle}
          onSubmitEditing={handleSubmit}
          placeholder="Ne yapman gerekiyor?"
          placeholderTextColor="#8A929D"
          returnKeyType="done"
          style={styles.titleInput}
          value={title}
        />

         <Text style={styles.fieldLabel}>Tarih</Text>
        <Pressable
          accessibilityLabel={`Tarih ${formatDate(dateFromKey(date))}`}
          accessibilityRole="button"
          disabled={saving}
          onPress={() => setShowDatePicker(true)}
          style={({ pressed }) => [styles.dateButton, pressed && styles.pressedButton]}
        >
          <Text style={styles.timeButtonText}>{formatDate(dateFromKey(date))}</Text>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            mode="date"
            minimumDate={earliestAllowedDate}
            onDismiss={() => setShowDatePicker(false)}
             onValueChange={(_event, selected) => {
               setShowDatePicker(false);
               if (selected) setDate(toDateKey(selected));
            }}
            value={dateFromKey(date)}
          />
        )}

        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: recurring }} disabled={saving} onPress={() => setRecurring((value) => !value)} style={styles.recurrenceToggle}>
          <View style={[styles.checkbox, recurring && styles.checkedBox]}>{recurring && <Text style={styles.checkmark}>✓</Text>}</View>
          <Text style={styles.recurrenceLabel}>Tekrar eden görev</Text>
        </Pressable>
        {recurring && (
          <>
            <Text style={styles.fieldLabel}>Tekrar sıklığı</Text>
            <View style={styles.tagList}>
              {([['daily', 'Her gün'], ['weekly', 'Her hafta aynı gün'], ['monthly', 'Her ay aynı gün']] as const).map(([value, label]) => (
                <Pressable accessibilityRole="radio" accessibilityState={{ selected: frequency === value }} disabled={saving} key={value} onPress={() => setFrequency(value)} style={[styles.tagButton, frequency === value && styles.selectedTagButton]}>
                  <Text style={[styles.tagText, frequency === value && styles.selectedTagText]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Bitiş tarihi (isteğe bağlı)</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => setShowEndDatePicker(true)} style={styles.dateButton}>
              <Text style={styles.timeButtonText}>{endDate ? formatDate(dateFromKey(endDate)) : `En fazla ${formatDate(maxEndDate)}`}</Text>
            </Pressable>
            {showEndDatePicker && <DateTimePicker mode="date" minimumDate={dateFromKey(date)} maximumDate={maxEndDate} value={endDate ? dateFromKey(endDate) : maxEndDate} onDismiss={() => setShowEndDatePicker(false)} onValueChange={(_event, selected) => { setShowEndDatePicker(false); if (selected) setEndDate(toDateKey(selected)); }} />}
          </>
        )}

        <Text style={styles.fieldLabel}>Saat (isteğe bağlı)</Text>
        <View style={styles.timeRow}>
          <Pressable accessibilityLabel={time ? `Saat ${formatTime(time)}` : 'Saat seç'} accessibilityRole="button" onPress={() => setShowTimePicker(true)} style={({ pressed }) => [styles.timeButton, pressed && styles.pressedButton]}>
            <Text style={styles.timeButtonText}>{time ? formatTime(time) : 'Saat seç'}</Text>
          </Pressable>
           {time && <Pressable accessibilityLabel="Seçilen saati temizle" accessibilityRole="button" onPress={() => setTime(null)} style={styles.clearTimeButton}><Text style={styles.clearTimeText}>Temizle</Text></Pressable>}
        </View>
        {showTimePicker && (
          <DateTimePicker
            mode="time"
            onDismiss={() => setShowTimePicker(false)}
             onValueChange={(_event, selected) => {
               setShowTimePicker(false);
               if (selected) setTime(selected);
            }}
            value={time ?? new Date()}
          />
        )}

        <Text style={styles.fieldLabel}>Etiket</Text>
        <View style={styles.tagList}>
          {TODO_TAGS.map((item) => (
             <Pressable accessibilityLabel={`${TODO_TAG_LABELS[item]} etiketini seç`} accessibilityRole="radio" accessibilityState={{ selected: tag === item }} key={item} onPress={() => setTag(item)} style={[styles.tagButton, tag === item && styles.selectedTagButton]}>
              <Text style={[styles.tagIcon, tag === item && styles.selectedTagText]}>{TODO_TAG_ICONS[item]}</Text>
              <Text style={[styles.tagText, tag === item && styles.selectedTagText]}>{TODO_TAG_LABELS[item]}</Text>
            </Pressable>
          ))}
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable accessibilityLabel="Görevi ekle" accessibilityRole="button" disabled={saving} onPress={handleSubmit} style={({ pressed }) => [styles.submitButton, pressed && styles.submitPressed, saving && styles.disabledButton]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Ekle</Text>}
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
