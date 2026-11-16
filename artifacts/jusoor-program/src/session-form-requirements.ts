type SessionProgramOption = {
  id: number;
  name: string;
};

export type SessionTimeIssue = 'nonexistent' | 'repeated' | 'invalid-time-zone';

export function getSessionTimeIssue(date: string, time: string, timeZone: string): SessionTimeIssue | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const normalizedDate = new Date(targetAsUtc);
  if (
    normalizedDate.getUTCFullYear() !== target.year
    || normalizedDate.getUTCMonth() + 1 !== target.month
    || normalizedDate.getUTCDate() !== target.day
  ) return null;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return 'invalid-time-zone';
  }

  const partsAt = (instant: number) => Object.fromEntries(
    formatter.formatToParts(new Date(instant))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
  const matchingInstants = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = targetAsUtc + hours * 60 * 60 * 1000;
    const parts = partsAt(sample);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const instant = targetAsUtc - (representedAsUtc - sample);
    const actual = partsAt(instant);
    if (
      actual.year === target.year
      && actual.month === target.month
      && actual.day === target.day
      && actual.hour === target.hour
      && actual.minute === target.minute
      && actual.second === 0
    ) matchingInstants.add(instant);
  }

  if (matchingInstants.size === 0) return 'nonexistent';
  if (matchingInstants.size > 1) return 'repeated';
  return null;
}

export function sessionTimeIssueMessage(issue: SessionTimeIssue): string {
  if (issue === 'nonexistent') {
    return 'This local time does not exist in the selected program time zone because clocks move forward. Choose another start time before saving.';
  }
  if (issue === 'repeated') {
    return 'This local time occurs twice in the selected program time zone because clocks move back. Choose a start time that occurs only once before saving.';
  }
  return 'The program time zone could not be checked. Ask an Admin to correct the time zone before saving.';
}

export function sessionProgramField(programs: readonly SessionProgramOption[], isAdmin: boolean) {
  return {
    name: 'programId',
    label: 'Program cohort',
    kind: 'select' as const,
    required: !isAdmin,
    hint: isAdmin ? undefined : 'Choose an assigned cohort. If none are listed, ask an admin to assign you to one.',
    options: programs.map(program => ({ value: String(program.id), label: program.name })),
  };
}
