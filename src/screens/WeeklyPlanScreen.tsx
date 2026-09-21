import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DraggableTodoRow } from '../components/DraggableTodoRow';
import { PrivacyInfo } from '../components/PrivacyInfo';
import { TodoEditor } from '../components/TodoEditor';
import { TodoForm } from '../components/TodoForm';
import { loadTodos, moveTodo, removeTodosBeforePreviousWeek, updateTodo } from '../storage/todoStorage';
import { styles } from '../styles/appStyles';
import type { Todo } from '../types/todo';
import { dayNames, formatDate } from '../utils/date';
import { replaceTodo, sortTodos } from '../utils/todos';
import { addWeeks, getWeek, getWeekDates, toDateKey } from '../utils/week';

type Layout = { y: number; height: number };
type DragPreview = { todoId: string; date: string; index: number };
type TodoLayout = Layout & { date: string; localY: number };

const PRIVACY_NOTICE_KEY = '@haftalik-plan/privacy-notice-seen';

export function WeeklyPlanScreen() {
  const currentWeek = getWeek();
  const [selectedMonday, setSelectedMonday] = useState(currentWeek.monday);
  const week = getWeekDates(selectedMonday);
  const firstDay = week[0];
  const lastDay = week[6];
  const todayKey = toDateKey(new Date());
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todoDate, setTodoDate] = useState<string | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  const [showFirstUseNotice, setShowFirstUseNotice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const dayScrollRef = useRef<ScrollView | null>(null);
  const scrollWindowRef = useRef<View | null>(null);
  const dayLayouts = useRef<Record<string, Layout>>({});
  const todoListLayouts = useRef<Record<string, { y: number }>>({});
  const todoLayouts = useRef<Record<string, TodoLayout>>({});
  const dragOrigin = useRef<Layout | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const dragStartScrollOffset = useRef(0);
  const scrollOffset = useRef(0);
  const scrollContentHeight = useRef(0);
  const scrollWindow = useRef({ y: 0, height: 0 });
  const todayOffset = useRef<number | null>(null);
  const todayHeight = useRef(0);
  const todayHeadingHeight = useRef(0);
  const dayScrollHeight = useRef(0);
  const isCurrentWeek = toDateKey(selectedMonday) === toDateKey(currentWeek.monday);
  const isEarliestWeek = toDateKey(selectedMonday) === toDateKey(addWeeks(currentWeek.monday, -1));

  useEffect(() => {
    setSelectedMonday(getWeek().monday);
  }, []);

  const refreshTodos = (cleanupOldTodos = false) => {
    setLoading(true);
    setLoadError(false);
    const load = cleanupOldTodos
      ? removeTodosBeforePreviousWeek().then(loadTodos)
      : loadTodos();

    load
      .then(setTodos)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshTodos(true);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_NOTICE_KEY).then((seen) => {
      if (!seen) setShowFirstUseNotice(true);
    });
  }, []);

  const closeFirstUseNotice = async () => {
    setShowFirstUseNotice(false);
    await AsyncStorage.setItem(PRIVACY_NOTICE_KEY, 'true');
  };

  const todosForDate = (date: string) => sortTodos(todos.filter((todo) => todo.date === date));

  const setCurrentDragPreview = (preview: DragPreview | null) => {
    dragPreviewRef.current = preview;
    setDragPreview(preview);
  };

  const startDragging = (todo: Todo) => {
    const layout = todoLayouts.current[todo.id];
    if (!layout) return;

    dragOrigin.current = { y: layout.y, height: layout.height };
    dragStartScrollOffset.current = scrollOffset.current;
    scrollWindowRef.current?.measureInWindow((_x, y, _width, height) => {
      scrollWindow.current = { y, height };
    });
    const index = todosForDate(todo.date)
      .filter(({ id }) => id !== todo.id)
      .filter((item) => {
        const itemLayout = todoLayouts.current[item.id];
        return itemLayout && itemLayout.y < layout.y;
      }).length;
    setCurrentDragPreview({ todoId: todo.id, date: todo.date, index });
  };

  const updateDragPreview = (todo: Todo, dy: number, moveY: number) => {
    const origin = dragOrigin.current;
    if (!origin) return 0;

    const edgeSize = 72;
    const { y: windowY, height: windowHeight } = scrollWindow.current;
    const maxOffset = Math.max(0, scrollContentHeight.current - windowHeight);
    let nextOffset = scrollOffset.current;
    if (windowHeight > 0 && moveY < windowY + edgeSize) {
      nextOffset = Math.max(0, nextOffset - 18);
    } else if (windowHeight > 0 && moveY > windowY + windowHeight - edgeSize) {
      nextOffset = Math.min(maxOffset, nextOffset + 18);
    }
    if (nextOffset !== scrollOffset.current) {
      scrollOffset.current = nextOffset;
      dayScrollRef.current?.scrollTo({ animated: false, y: nextOffset });
    }

    const scrollCompensation = scrollOffset.current - dragStartScrollOffset.current;
    const center = origin.y + origin.height / 2 + dy + scrollCompensation;
    const days = week.flatMap((date) => {
      const dateKey = toDateKey(date);
      const layout = dayLayouts.current[dateKey];
      return layout ? [[dateKey, layout] as [string, Layout]] : [];
    });
    const targetDay =
      days.find(([, layout]) => center >= layout.y && center <= layout.y + layout.height) ??
      days.sort(
        ([, first], [, second]) =>
          Math.abs(center - (first.y + first.height / 2)) -
          Math.abs(center - (second.y + second.height / 2)),
      )[0];
    if (!targetDay) return scrollCompensation;

    const targetTodos = todosForDate(targetDay[0]).filter(({ id }) => id !== todo.id);
    const index = targetTodos.filter((item) => {
      const layout = todoLayouts.current[item.id];
      return layout && layout.y + layout.height / 2 < center;
    }).length;
    const preview = { todoId: todo.id, date: targetDay[0], index };
    const current = dragPreviewRef.current;
    if (!current || current.date !== preview.date || current.index !== preview.index) {
      setCurrentDragPreview(preview);
    }
    return scrollCompensation;
  };

  const updateTodoPositions = (date: string) => {
    const dayY = dayLayouts.current[date]?.y ?? 0;
    const listY = todoListLayouts.current[date]?.y ?? 0;
    Object.values(todoLayouts.current).forEach((layout) => {
      if (layout.date === date) layout.y = dayY + listY + layout.localY;
    });
  };

  const dropTodo = async (todo: Todo) => {
    const target = dragPreviewRef.current;
    if (!target || target.todoId !== todo.id) return;
    try {
      const movedTodo = await moveTodo(todo.id, target.date, target.index);
      if (movedTodo) setTodos(await loadTodos());
    } catch {
      Alert.alert('Sıralama başarısız', 'Görev taşınamadı.');
    }
  };

  const getDropIndicatorTop = (date: string, dayTodos: Todo[]) => {
    if (!dragPreview || dragPreview.date !== date) return null;
    const targetTodos = dayTodos.filter(({ id }) => id !== dragPreview.todoId);
    const nextTodo = targetTodos[dragPreview.index];
    if (nextTodo) return Math.max(0, todoLayouts.current[nextTodo.id]?.localY ?? 0);
    const lastTodo = targetTodos[targetTodos.length - 1];
    if (!lastTodo) return 0;
    const layout = todoLayouts.current[lastTodo.id];
    return layout ? layout.localY + layout.height : 0;
  };

  const finishDragging = () => {
    dragOrigin.current = null;
    setCurrentDragPreview(null);
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      const updatedTodo = await updateTodo(todo.id, { completed: !todo.completed });
      if (updatedTodo) setTodos((current) => replaceTodo(current, updatedTodo));
    } catch {
      Alert.alert('Güncelleme başarısız', 'Görevin durumu değiştirilemedi.');
    }
  };

  const getTodayScrollOffset = () => Math.max(
    0,
    (todayOffset.current ?? 0) +
      (todayHeadingHeight.current || todayHeight.current) / 2 -
      dayScrollHeight.current / 2,
  );

  useEffect(() => {
    let secondFrame: number | null = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (loading) return;
        if (isCurrentWeek && todayOffset.current !== null && dayScrollHeight.current > 0) {
          dayScrollRef.current?.scrollTo({ animated: false, y: getTodayScrollOffset() });
        } else {
          dayScrollRef.current?.scrollTo({ animated: false, y: 0 });
        }
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [isCurrentWeek, loading, selectedMonday]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.planContent}>
        <View style={styles.planTopBar}>
          <Text style={styles.topBarLabel}>PLAN SEVEN</Text>
          <Pressable accessibilityLabel="Gizlilik ve ayarları aç" accessibilityRole="button" onPress={() => setShowPrivacyInfo(true)} style={({ pressed }) => [styles.settingsButton, pressed && styles.pressedButton]}>
            <Text style={styles.settingsIcon}>⚙︎</Text>
          </Pressable>
        </View>
        <View style={styles.planHeader}>
          <Text style={styles.planTitle}>{formatDate(firstDay)} - {formatDate(lastDay)}</Text>
          <View style={styles.navigation}>
            <Pressable accessibilityLabel="Önceki haftaya git" accessibilityRole="button" disabled={isEarliestWeek} onPress={() => setSelectedMonday(addWeeks(selectedMonday, -1))} style={({ pressed }) => [styles.arrowButton, isEarliestWeek && styles.disabledButton, pressed && !isEarliestWeek && styles.pressedButton]}>
              <Text style={[styles.arrow, isEarliestWeek && styles.disabledText]}>‹</Text>
            </Pressable>
            <Pressable accessibilityLabel="Bugüne dön" accessibilityRole="button" onPress={() => setSelectedMonday(currentWeek.monday)} style={({ pressed }) => [styles.titleButton, pressed && styles.pressedButton]}>
              <Text style={styles.navigationLabel}>Bugün</Text>
            </Pressable>
            <Pressable accessibilityLabel="Sonraki haftaya git" accessibilityRole="button" onPress={() => setSelectedMonday(addWeeks(selectedMonday, 1))} style={({ pressed }) => [styles.arrowButton, pressed && styles.pressedButton]}>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View ref={scrollWindowRef} style={styles.dayScroll}>
        <ScrollView
          ref={dayScrollRef}
          style={styles.dayScroll}
          contentContainerStyle={styles.dayScrollContent}
          onContentSizeChange={(_width, height) => { scrollContentHeight.current = height; }}
          onLayout={(event) => { dayScrollHeight.current = event.nativeEvent.layout.height; }}
          onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          <View style={styles.weekList}>
            {week.map((date) => {
              const dateKey = toDateKey(date);
              const dayTodos = todosForDate(dateKey);
              const indicatorTop = getDropIndicatorTop(dateKey, dayTodos);
              return (
                <View
                  key={dateKey}
                  onLayout={(event) => {
                    dayLayouts.current[dateKey] = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height };
                    updateTodoPositions(dateKey);
                    if (dateKey === todayKey) {
                      todayOffset.current = event.nativeEvent.layout.y;
                      todayHeight.current = event.nativeEvent.layout.height;
                    }
                  }}
                  style={[styles.dayCard, dateKey === todayKey && styles.todayCard]}
                >
                  <View onLayout={(event) => { if (dateKey === todayKey) todayHeadingHeight.current = event.nativeEvent.layout.height; }} style={styles.dayHeading}>
                    <Text style={styles.dayName}>{dayNames[date.getDay()]}</Text>
                    <Text style={styles.dayDate}>{formatDate(date)}</Text>
                  </View>
                  {loading ? <ActivityIndicator accessibilityLabel="Görevler yükleniyor" color="#E76F51" style={styles.dayLoader} /> : loadError ? (
                     <View style={styles.errorState}>
                       <Text style={styles.errorStateText}>Görevler yüklenemedi.</Text>
                       <Pressable accessibilityLabel="Görevleri yeniden yükle" accessibilityRole="button" onPress={() => refreshTodos()} style={({ pressed }) => [styles.retryButton, pressed && styles.pressedButton]}>
                         <Text style={styles.retryButtonText}>Tekrar dene</Text>
                       </Pressable>
                     </View>
                   ) : dayTodos.length > 0 ? (
                    <View onLayout={(event) => { todoListLayouts.current[dateKey] = { y: event.nativeEvent.layout.y }; updateTodoPositions(dateKey); }} style={styles.todoList}>
                      {dayTodos.map((todo) => (
                        <DraggableTodoRow
                          key={todo.id}
                          onDrop={() => dropTodo(todo)}
                          onDragEnd={finishDragging}
                          onDragMove={(dy, moveY) => updateDragPreview(todo, dy, moveY)}
                          onDragStart={() => startDragging(todo)}
                          onEdit={() => setEditingTodo(todo)}
                          onLayout={(layout) => {
                            todoLayouts.current[todo.id] = {
                              date: dateKey,
                              height: layout.height,
                              localY: layout.y,
                              y: (dayLayouts.current[dateKey]?.y ?? 0) + (todoListLayouts.current[dateKey]?.y ?? 0) + layout.y,
                            };
                          }}
                          onToggle={() => toggleTodo(todo)}
                          todo={todo}
                        />
                      ))}
                      {indicatorTop !== null && (
                        <View pointerEvents="none" style={[styles.dropIndicator, { top: indicatorTop }]}>
                          <View style={styles.dropIndicatorDot} />
                          <View style={styles.dropIndicatorLine} />
                          <View style={styles.dropIndicatorDot} />
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={[styles.emptyDay, dragPreview?.date === dateKey && styles.emptyDayDropTarget]}>
                      {dragPreview?.date === dateKey ? (
                        <><Text style={styles.emptyDayDropIcon}>↓</Text><Text style={styles.emptyDayDropText}>Görevi buraya bırak</Text></>
                      ) : <Text style={styles.emptyDayText}>Henüz görev yok</Text>}
                    </View>
                  )}
                  <Pressable accessibilityLabel={`${dayNames[date.getDay()]} gününe görev ekle`} accessibilityRole="button" hitSlop={11} onPress={() => setTodoDate(dateKey)} style={({ pressed }) => [styles.addTodoButton, pressed && styles.pressedButton]}>
                    <Text style={styles.addTodoIcon}>+</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

       <Modal animationType="slide" onRequestClose={() => setTodoDate(null)} transparent visible={todoDate !== null}>
         {todoDate && <TodoForm initialDate={todoDate} onClose={() => setTodoDate(null)} onCreated={(created) => { setTodos((current) => [...current, ...created]); setTodoDate(null); }} />}
      </Modal>
       <Modal animationType="slide" onRequestClose={() => setEditingTodo(null)} transparent visible={editingTodo !== null}>
         {editingTodo && <TodoEditor todo={editingTodo} onClose={() => setEditingTodo(null)} onDeleted={(ids) => { setTodos((current) => current.filter((todo) => !ids.includes(todo.id))); setEditingTodo(null); }} onSaved={(saved) => { setTodos((current) => saved.reduce((list, item) => replaceTodo(list, item), current)); setEditingTodo(null); }} />}
      </Modal>
      <Modal animationType="slide" onRequestClose={() => setShowPrivacyInfo(false)} transparent visible={showPrivacyInfo}>
        <PrivacyInfo onClose={() => setShowPrivacyInfo(false)} />
      </Modal>
      <Modal animationType="fade" onRequestClose={closeFirstUseNotice} transparent visible={showFirstUseNotice}>
        <PrivacyInfo firstUse onClose={closeFirstUseNotice} />
      </Modal>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}
