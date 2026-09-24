import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteTodo, deleteTodoSeries, updateTodo, updateTodoSeries } from '../storage/todoStorage';
import { styles } from '../styles/appStyles';
import { TODO_TAG_ICONS, TODO_TAG_LABELS, TODO_TAGS, type Todo, type TodoTag } from '../types/todo';
import { dateFromKey, formatDate, formatTime } from '../utils/date';
import { addWeeks, getWeek, toDateKey } from '../utils/week';

type Props = {
  todo: Todo;
  onClose: () => void;
  onSaved: (todos: Todo[]) => void;
  onDeleted: (ids: string[]) => void;
};

export function TodoEditor({ todo, onClose, onSaved, onDeleted }: Props) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(todo.title);
  const [date, setDate] = useState(todo.date);
  const [time, setTime] = useState<Date | null>(todo.time ? dateFromKey(todo.date) : null);
  const [tag, setTag] = useState<TodoTag>(todo.tag);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const earliestAllowedDate = addWeeks(getWeek().monday, -1);
  const editorScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (todo.time) {
      const [hours, minutes] = todo.time.split(':').map(Number);
      const nextTime = dateFromKey(todo.date);
      nextTime.setHours(hours, minutes, 0, 0);
      setTime(nextTime);
    }
  }, [todo.date, todo.time]);

  const changes = {
    ...(date === todo.date ? {} : { date }),
    title: title.trim(),
    time: time ? formatTime(time) : null,
    tag,
  };

  const saveChanges = async (allSeries: boolean) => {
    try {
      const saved = allSeries && todo.recurrence
        ? await updateTodoSeries(todo.recurrence.id, todo.date, changes)
        : [await updateTodo(todo.id, changes)].filter((item): item is Todo => item !== null);
      onSaved(saved);
    } catch {
      setError('Görev güncellenemedi. Lütfen tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Görev başlığı gerekli.');
      requestAnimationFrame(() => editorScrollRef.current?.scrollTo({ animated: true, y: 0 }));
      return;
    }

    setSaving(true);
    setError('');
    if (todo.recurrence) {
      Alert.alert('Tekrarlı görev', 'Bu değişikliği nasıl uygulamak istersin?', [
        { text: 'Sadece bu görev', onPress: () => saveChanges(false) },
        { text: 'Tüm seri', onPress: () => saveChanges(true) },
        { text: 'Vazgeç', style: 'cancel', onPress: () => setSaving(false) },
      ]);
    } else {
      await saveChanges(false);
    }
  };

  const deleteOne = async () => {
    setSaving(true);
    try {
      await deleteTodo(todo.id);
      onDeleted([todo.id]);
    } catch {
      setError('Görev silinemedi. Lütfen tekrar dene.');
      setSaving(false);
    }
  };

  const deleteSeries = async () => {
    setSaving(true);
    try {
      const deletedIds = await deleteTodoSeries(todo.recurrence!.id);
      onDeleted(deletedIds);
    } catch {
      setError('Görev serisi silinemedi. Lütfen tekrar dene.');
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (todo.recurrence) {
      Alert.alert('Tekrarlı görevi sil', 'Bu görevi nasıl silmek istersin?', [
        { text: 'Sadece bu görev', onPress: deleteOne },
        { text: 'Tüm seri', style: 'destructive', onPress: deleteSeries },
        { text: 'Vazgeç', style: 'cancel' },
      ]);
      return;
    }

    Alert.alert('Görevi silmek istediğinize emin misiniz?', undefined, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: deleteOne },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
      <ScrollView
        ref={editorScrollRef}
        contentContainerStyle={styles.modalScrollContent}
        keyboardShouldPersistTaps="handled"
        style={styles.modalScroll}
      >
      <View style={[styles.modalCard, { paddingBottom: 26 + insets.bottom }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Görevi Düzenle</Text>
          <Pressable accessibilityLabel="Görev düzenleme penceresini kapat" accessibilityRole="button" disabled={saving} onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>Başlık</Text>
        <TextInput editable={!saving} maxLength={120} onChangeText={setTitle} placeholder="Ne yapman gerekiyor?" placeholderTextColor="#8A929D" style={styles.titleInput} value={title} />

        <Text style={styles.fieldLabel}>Tarih</Text>
        <Pressable accessibilityLabel={`Tarih ${formatDate(dateFromKey(date))}`} accessibilityRole="button" disabled={saving} onPress={() => setPicker('date')} style={({ pressed }) => [styles.dateButton, pressed && styles.pressedButton]}>
          <Text style={styles.timeButtonText}>{formatDate(dateFromKey(date))}</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Saat (isteğe bağlı)</Text>
        <View style={styles.timeRow}>
          <Pressable accessibilityLabel={time ? `Saat ${formatTime(time)}` : 'Saat seç'} accessibilityRole="button" disabled={saving} onPress={() => setPicker('time')} style={({ pressed }) => [styles.timeButton, pressed && styles.pressedButton]}>
            <Text style={styles.timeButtonText}>{time ? formatTime(time) : 'Saat seç'}</Text>
          </Pressable>
           {time && <Pressable accessibilityLabel="Seçilen saati temizle" accessibilityRole="button" disabled={saving} onPress={() => setTime(null)} style={styles.clearTimeButton}><Text style={styles.clearTimeText}>Temizle</Text></Pressable>}
        </View>
        {picker && (
          <DateTimePicker
            mode={picker}
            minimumDate={picker === 'date' ? earliestAllowedDate : undefined}
            onDismiss={() => setPicker(null)}
            onValueChange={(_event, selected) => {
              const pickerType = picker;
              setPicker(null);
               if (!selected) return;
               if (pickerType === 'date') setDate(toDateKey(selected));
               else setTime(selected);
            }}
            value={picker === 'date' ? dateFromKey(date) : time ?? new Date()}
          />
        )}

        <Text style={styles.fieldLabel}>Etiket</Text>
        <View style={styles.tagList}>
          {TODO_TAGS.map((item) => (
             <Pressable accessibilityLabel={`${TODO_TAG_LABELS[item]} etiketini seç`} accessibilityRole="radio" accessibilityState={{ selected: tag === item }} disabled={saving} key={item} onPress={() => setTag(item)} style={[styles.tagButton, tag === item && styles.selectedTagButton]}>
              <Text style={[styles.tagIcon, tag === item && styles.selectedTagText]}>{TODO_TAG_ICONS[item]}</Text>
              <Text style={[styles.tagText, tag === item && styles.selectedTagText]}>{TODO_TAG_LABELS[item]}</Text>
            </Pressable>
          ))}
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.editorActions}>
           <Pressable accessibilityLabel="Görevi sil" accessibilityRole="button" disabled={saving} onPress={confirmDelete} style={styles.deleteButton}><Text style={styles.deleteText}>Sil</Text></Pressable>
           <Pressable accessibilityLabel="Görev değişikliklerini kaydet" accessibilityRole="button" disabled={saving} onPress={handleSubmit} style={({ pressed }) => [styles.submitButton, styles.saveButton, pressed && styles.submitPressed, saving && styles.disabledButton]}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Kaydet</Text>}
          </Pressable>
        </View>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
