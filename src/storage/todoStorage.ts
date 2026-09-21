import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  TODO_TAGS,
  type NewTodo,
  type Todo,
  type TodoChanges,
  type TodoTag,
  type RecurrenceFrequency,
} from '../types/todo';
import { addWeeks, getWeek, toDateKey } from '../utils/week';

export const TODOS_STORAGE_KEY = '@haftalik-plan/todos';

const isTodoTag = (value: unknown): value is TodoTag =>
  typeof value === 'string' && TODO_TAGS.includes(value as TodoTag);

const isTodo = (value: unknown): value is Todo => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const todo = value as Record<string, unknown>;
  return (
    typeof todo.id === 'string' &&
    todo.id.length > 0 &&
    typeof todo.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(todo.date) &&
    typeof todo.title === 'string' &&
    todo.title.trim().length > 0 &&
    (todo.time === null ||
      (typeof todo.time === 'string' && /^\d{2}:\d{2}$/.test(todo.time))) &&
    isTodoTag(todo.tag) &&
    typeof todo.completed === 'boolean' &&
    typeof todo.order === 'number' &&
    Number.isFinite(todo.order) &&
    (todo.manualOrder === undefined || typeof todo.manualOrder === 'boolean')
    && (todo.recurrence === undefined || (
      typeof todo.recurrence === 'object' && todo.recurrence !== null &&
      typeof (todo.recurrence as Record<string, unknown>).id === 'string' &&
      ['daily', 'weekly', 'monthly'].includes((todo.recurrence as Record<string, unknown>).frequency as string) &&
      typeof (todo.recurrence as Record<string, unknown>).endDate === 'string'
    ))
  );
};

const readTodos = async (): Promise<Todo[]> => {
  const serializedTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
  if (!serializedTodos) {
    return [];
  }

  try {
    const parsedTodos: unknown = JSON.parse(serializedTodos);
    return Array.isArray(parsedTodos) ? parsedTodos.filter(isTodo) : [];
  } catch {
    // Bozuk yerel veri uygulamayi durdurmak yerine bos listeye doner.
    return [];
  }
};

const writeTodos = async (todos: Todo[]) => {
  await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(todos));
};

const createTodoId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const sortDayTodos = (todos: Todo[]) => {
  const hasManualOrder = todos.some((todo) => todo.manualOrder);
  return [...todos].sort((first, second) => {
    if (hasManualOrder) return first.order - second.order;
    if (first.time === null) return 1;
    if (second.time === null) return -1;
    return first.time.localeCompare(second.time) || first.order - second.order;
  });
};

export const loadTodos = readTodos;

const earliestAllowedTodoDate = () => toDateKey(addWeeks(getWeek().monday, -1));
const maximumRecurrenceDate = (date: string) => {
  const result = new Date(`${date}T12:00:00`);
  result.setMonth(result.getMonth() + 3);
  return toDateKey(result);
};

export const removeTodosBeforePreviousWeek = async (): Promise<void> => {
  const todos = await readTodos();
  const previousWeekStart = toDateKey(addWeeks(getWeek().monday, -1));
  const retainedTodos = todos.filter(({ date }) => date >= previousWeekStart);

  if (retainedTodos.length > 0) {
    await writeTodos(retainedTodos);
  } else {
    await AsyncStorage.removeItem(TODOS_STORAGE_KEY);
  }
};

export const addTodo = async (input: NewTodo): Promise<Todo> => {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Görev basligi bos olamaz.');
  }
  if (input.date < earliestAllowedTodoDate()) {
    throw new Error('Gecmis haftalardaki tarihlere gorev eklenemez.');
  }

  const todos = await readTodos();
  const todo: Todo = {
    ...input,
    id: createTodoId(),
    title,
    order: input.order ?? todos.filter(({ date }) => date === input.date).length,
  };

  await writeTodos([...todos, todo]);
  return todo;
};

const addMonthsSameDay = (date: Date, amount: number) => {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + amount);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
};

const nextRecurrenceDate = (date: Date, frequency: RecurrenceFrequency) => {
  if (frequency === 'daily') {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (frequency === 'weekly') return addWeeks(date, 1);
  return addMonthsSameDay(date, 1);
};

const shiftSeriesDate = (
  todoDate: string,
  anchorDate: string,
  nextAnchorDate: string,
  frequency: RecurrenceFrequency,
) => {
  const todoDateValue = new Date(`${todoDate}T12:00:00`);
  const anchorDateValue = new Date(`${anchorDate}T12:00:00`);
  const nextAnchorDateValue = new Date(`${nextAnchorDate}T12:00:00`);

  if (frequency === 'daily') {
    const dayOffset = Math.round((todoDateValue.getTime() - anchorDateValue.getTime()) / 86400000);
    nextAnchorDateValue.setDate(nextAnchorDateValue.getDate() + dayOffset);
    return toDateKey(nextAnchorDateValue);
  }

  if (frequency === 'weekly') {
    const weekOffset = Math.round((todoDateValue.getTime() - anchorDateValue.getTime()) / (86400000 * 7));
    nextAnchorDateValue.setDate(nextAnchorDateValue.getDate() + weekOffset * 7);
    return toDateKey(nextAnchorDateValue);
  }

  const monthOffset =
    (todoDateValue.getFullYear() - anchorDateValue.getFullYear()) * 12 +
    todoDateValue.getMonth() - anchorDateValue.getMonth();
  return toDateKey(addMonthsSameDay(nextAnchorDateValue, monthOffset));
};

export const addRecurringTodos = async (
  input: Omit<NewTodo, 'recurrence'>,
  frequency: RecurrenceFrequency,
  endDate: string,
): Promise<Todo[]> => {
  const title = input.title.trim();
  if (!title) throw new Error('Görev basligi bos olamaz.');
  if (input.date < earliestAllowedTodoDate() || endDate < input.date || endDate > maximumRecurrenceDate(input.date)) {
    throw new Error('Geçersiz tekrar tarihleri.');
  }

  const todos = await readTodos();
  const recurrenceId = createTodoId();
  const recurrence = { id: recurrenceId, frequency, endDate };
  const created: Todo[] = [];
  let date = new Date(`${input.date}T12:00:00`);
  const lastDate = new Date(`${endDate}T12:00:00`);
  while (date <= lastDate) {
    const dateKey = toDateKey(date);
    created.push({
      ...input,
      id: createTodoId(),
      date: dateKey,
      title,
      recurrence,
      order: todos.filter((todo) => todo.date === dateKey).length + created.filter((todo) => todo.date === dateKey).length,
    });
    date = nextRecurrenceDate(date, frequency);
  }

  await writeTodos([...todos, ...created]);
  return created;
};

export const updateTodo = async (
  id: string,
  changes: TodoChanges,
): Promise<Todo | null> => {
  const todos = await readTodos();
  const index = todos.findIndex((todo) => todo.id === id);
  if (index === -1) {
    return null;
  }

  const nextTodo = {
    ...todos[index],
    ...changes,
    ...(changes.title === undefined ? {} : { title: changes.title.trim() }),
  };

  if (nextTodo.date < earliestAllowedTodoDate()) {
    throw new Error('Gecmis haftalardaki tarihlere gorev tasinamaz.');
  }

  if (!isTodo(nextTodo)) {
    throw new Error('Geçersiz görev verisi.');
  }

  const updatedTodos = [...todos];
  updatedTodos[index] = nextTodo;
  await writeTodos(updatedTodos);
  return nextTodo;
};

export const updateTodoSeries = async (
  recurrenceId: string,
  anchorDate: string,
  changes: TodoChanges,
): Promise<Todo[]> => {
  const todos = await readTodos();
  const matching = todos.filter((todo) => todo.recurrence?.id === recurrenceId);
  if (matching.length === 0) return [];
  const today = toDateKey(new Date());
  const nextAnchorDate = typeof changes.date === 'string' ? changes.date : anchorDate;
  const frequency = matching[0].recurrence!.frequency;
  const updated = todos.map((todo) => {
    if (todo.recurrence?.id !== recurrenceId || todo.date < today) return todo;
    const nextTodo = {
      ...todo,
      ...changes,
      date: typeof changes.date === 'string'
        ? shiftSeriesDate(todo.date, anchorDate, nextAnchorDate, frequency)
        : todo.date,
      completed: todo.completed,
    };
    if (changes.title !== undefined) nextTodo.title = changes.title.trim();
    if (!isTodo(nextTodo)) throw new Error('Geçersiz görev verisi.');
    return nextTodo;
  });
  await writeTodos(updated);
  return updated.filter((todo) => todo.recurrence?.id === recurrenceId);
};

export const deleteTodo = async (id: string): Promise<void> => {
  const todos = await readTodos();
  const remainingTodos = todos.filter((todo) => todo.id !== id);
  if (remainingTodos.length === 0) {
    await AsyncStorage.removeItem(TODOS_STORAGE_KEY);
    return;
  }

  await writeTodos(remainingTodos);
};

export const deleteTodoSeries = async (recurrenceId: string): Promise<string[]> => {
  const todos = await readTodos();
  const deletedIds = todos
    .filter((todo) => todo.recurrence?.id === recurrenceId)
    .map((todo) => todo.id);
  const remainingTodos = todos.filter((todo) => todo.recurrence?.id !== recurrenceId);

  if (remainingTodos.length === 0) {
    await AsyncStorage.removeItem(TODOS_STORAGE_KEY);
  } else {
    await writeTodos(remainingTodos);
  }
  return deletedIds;
};

export const reorderTodos = async (orderedIds: string[]): Promise<Todo[]> => {
  const todos = await readTodos();
  const idSet = new Set(orderedIds);
  const knownIds = new Set(todos.map(({ id }) => id));

  if (idSet.size !== orderedIds.length || orderedIds.some((id) => !knownIds.has(id))) {
    throw new Error('Geçersiz görev siralaması.');
  }

  const orderById = new Map(orderedIds.map((id, index) => [id, index]));
  const reorderedTodos = todos.map((todo) =>
    orderById.has(todo.id)
      ? { ...todo, order: orderById.get(todo.id)!, manualOrder: true }
      : todo,
  );

  await writeTodos(reorderedTodos);
  return reorderedTodos;
};

export const moveTodo = async (
  id: string,
  date: string,
  targetIndex: number,
): Promise<Todo | null> => {
  const todos = await readTodos();
  const source = todos.find((todo) => todo.id === id);
  if (!source) {
    return null;
  }

  const remaining = todos.filter((todo) => todo.id !== id);
  const destination = sortDayTodos(remaining.filter((todo) => todo.date === date));
  const index = Math.max(0, Math.min(targetIndex, destination.length));
  const moved = { ...source, date, order: index, manualOrder: true };
  destination.splice(index, 0, moved);

  const affectedDates = new Set([source.date, date]);
  const nextTodos = remaining.map((todo) => {
    if (!affectedDates.has(todo.date)) {
      return todo;
    }

    const dayTodos =
      todo.date === date
        ? destination
        : sortDayTodos(remaining.filter((item) => item.date === todo.date));
    const nextIndex = dayTodos.findIndex((item) => item.id === todo.id);
    return nextIndex === -1 ? todo : { ...todo, order: nextIndex, manualOrder: true };
  });

  nextTodos.push(moved);
  const movedTodo = nextTodos.find((todo) => todo.id === id) ?? null;
  await writeTodos(nextTodos);
  return movedTodo;
};
