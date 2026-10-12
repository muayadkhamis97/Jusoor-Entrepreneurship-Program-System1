import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import './calendar-communications.css';

export type CalendarSession = {
  id: number;
  title: string;
  type: string;
  scheduledDate: string;
  status: string;
};

const monthLabel = (date: Date) => date.toLocaleDateString('en', { month: 'long', year: 'numeric' });
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const sameMonth = (a: Date, b: Date) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

export function SessionCalendar({ sessions, selectedDate, onSelectDate }: {
  sessions: CalendarSession[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
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

  return <section className="session-calendar panel" aria-label="Session calendar" data-testid="session-calendar">
    <header className="session-calendar-head">
      <div className="session-calendar-title"><span className="calendar-icon"><CalendarDays size={18} /></span><div><div className="eyebrow">COHORT RHYTHM</div><h2 className="app-title">{monthLabel(month)}</h2></div></div>
      <div className="calendar-controls">
        <button className="icon-button" aria-label="Previous month" onClick={() => { setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1)); onSelectDate(null); }} data-testid="button-calendar-previous"><ChevronLeft size={17} /></button>
        <button className="button button-quiet calendar-today" onClick={() => { setMonth(new Date()); onSelectDate(isoDay(currentDate)); }} data-testid="button-calendar-today">Today</button>
        <button className="icon-button" aria-label="Next month" onClick={() => { setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1)); onSelectDate(null); }} data-testid="button-calendar-next"><ChevronRight size={17} /></button>
      </div>
    </header>
    <div className="calendar-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-days">{days.map(day => {
      const key = isoDay(day);
      const count = counts[key] || 0;
      const selected = selectedDate === key;
      if (!sameMonth(day, month)) return <span key={key} className="calendar-day outside-month" aria-hidden="true" />;
      return <button key={key} type="button" className={`calendar-day ${count ? 'has-session' : ''} ${selected ? 'is-selected' : ''} ${isoDay(currentDate) === key ? 'is-today' : ''}`} onClick={() => onSelectDate(selected ? null : key)} aria-pressed={selected} aria-label={`${day.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}${count ? `, ${count} ${count === 1 ? 'session' : 'sessions'}` : ', no sessions'}`} data-testid={`button-calendar-day-${key}`}>
        <span>{day.getDate()}</span>{count > 0 && <i aria-hidden="true">{count}</i>}
      </button>;
    })}</div>
    <footer className="session-calendar-foot"><span><i className="calendar-dot" /> Session scheduled</span><button type="button" className="text-link" onClick={() => onSelectDate(null)} data-testid="button-clear-calendar-date">{selectedDate ? 'Show all dates' : `${sessions.length} sessions in view`}</button></footer>
  </section>;
}
