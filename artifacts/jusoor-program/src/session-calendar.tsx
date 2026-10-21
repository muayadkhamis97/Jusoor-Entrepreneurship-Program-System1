import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppLanguage, t } from './language';
import './calendar-communications.css';

export type CalendarSession = {
  id: number;
  title: string;
  type: string;
  scheduledDate: string;
  status: string;
};

const monthLabel = (date: Date, locale: string) => date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const sameMonth = (a: Date, b: Date) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

export function SessionCalendar({ sessions, selectedDate, onSelectDate }: {
  sessions: CalendarSession[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const { language } = useAppLanguage();
  const locale = language === 'ar' ? 'ar-JO' : 'en-GB';
  const [month, setMonth] = useState(() => {
    const next = sessions.map(session => new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`)).filter(date => !Number.isNaN(date.getTime()) && date >= new Date(new Date().toDateString())).sort((a, b) => a.getTime() - b.getTime())[0];
    return next || new Date();
  });
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);
  const counts = useMemo(() => sessions.reduce<Record<string, number>>((map, session) => {
    map[session.scheduledDate.slice(0, 10)] = (map[session.scheduledDate.slice(0, 10)] || 0) + 1;
    return map;
  }, {}), [sessions]);
  const currentDate = new Date();
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2024, 0, 1 + index);
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }), [locale]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return <section className="session-calendar panel" aria-label={t('Session calendar')} data-testid="session-calendar">
    <header className="session-calendar-head">
      <div className="session-calendar-title"><span className="calendar-icon"><CalendarDays size={18} /></span><div><div className="eyebrow">{t('COHORT RHYTHM')}</div><h2 className="app-title">{monthLabel(month, locale)}</h2></div></div>
      <div className="calendar-controls">
        <button className="icon-button" aria-label={t('Previous month')} onClick={() => { setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1)); onSelectDate(null); }} data-testid="button-calendar-previous"><ChevronLeft size={17} /></button>
        <button className="button button-quiet calendar-today" onClick={() => { setMonth(new Date()); onSelectDate(isoDay(currentDate)); }} data-testid="button-calendar-today">{t('Today')}</button>
        <button className="icon-button" aria-label={t('Next month')} onClick={() => { setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1)); onSelectDate(null); }} data-testid="button-calendar-next"><ChevronRight size={17} /></button>
      </div>
    </header>
    <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day, index) => <span key={index}>{day}</span>)}</div>
    <div className="calendar-days">{days.map(day => {
      const key = isoDay(day);
      const count = counts[key] || 0;
      const selected = selectedDate === key;
      if (!sameMonth(day, month)) return <span key={key} className="calendar-day outside-month" aria-hidden="true" />;
      return <button key={key} type="button" className={`calendar-day ${count ? 'has-session' : ''} ${selected ? 'is-selected' : ''} ${isoDay(currentDate) === key ? 'is-today' : ''}`} onClick={() => onSelectDate(selected ? null : key)} aria-pressed={selected} aria-label={`${day.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}${count ? `, ${numberFormatter.format(count)} ${t(count === 1 ? 'session' : 'sessions')}` : `, ${t('No sessions')}`}`} data-testid={`button-calendar-day-${key}`}>
        <span>{numberFormatter.format(day.getDate())}</span>{count > 0 && <i aria-hidden="true">{numberFormatter.format(count)}</i>}
      </button>;
    })}</div>
    <footer className="session-calendar-foot"><span><i className="calendar-dot" /> {t('Session scheduled')}</span><button type="button" className="text-link" onClick={() => onSelectDate(null)} data-testid="button-clear-calendar-date">{selectedDate ? t('Show all dates') : `${numberFormatter.format(sessions.length)} ${t('sessions in view')}`}</button></footer>
  </section>;
}
