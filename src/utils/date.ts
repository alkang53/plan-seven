export const dayNames = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
];

const monthNames = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function formatDate(date: Date) {
  return `${date.getDate()} ${monthNames[date.getMonth()]}`;
}

export function formatDateRange(start: Date, end: Date) {
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}-${end.getDate()} ${monthNames[end.getMonth()]}`;
  }
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

export function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}
