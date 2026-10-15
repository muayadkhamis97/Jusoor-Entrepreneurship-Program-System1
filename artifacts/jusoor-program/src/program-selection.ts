import { useEffect, useState } from 'react';

const PROGRAM_SELECTION_KEY = 'jusoor-program-selection';

type ProgramOption = { id: number };

export function resolveProgramSelection(
  savedId: number | null,
  programs: ProgramOption[],
  defaultToFirst = false,
): number | null {
  if (savedId !== null && programs.some(program => program.id === savedId)) return savedId;
  return defaultToFirst ? programs[0]?.id ?? null : null;
}

function readSavedProgramId(): number | null {
  try {
    const value = Number(window.sessionStorage.getItem(PROGRAM_SELECTION_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function storeProgramId(id: number | null) {
  try {
    if (id === null) window.sessionStorage.removeItem(PROGRAM_SELECTION_KEY);
    else window.sessionStorage.setItem(PROGRAM_SELECTION_KEY, String(id));
  } catch {
    // Program selection still works in memory when storage is unavailable.
  }
}

export function useProgramSelection(programs: ProgramOption[], defaultToFirst = false) {
  const [savedId, setSavedId] = useState<number | null>(readSavedProgramId);
  const selectedId = resolveProgramSelection(savedId, programs, defaultToFirst);

  useEffect(() => {
    if (!programs.length) return;
    if (savedId !== null && !programs.some(program => program.id === savedId)) {
      setSavedId(null);
      storeProgramId(null);
      return;
    }
    if (savedId === null && defaultToFirst && programs[0]) {
      setSavedId(programs[0].id);
      storeProgramId(programs[0].id);
    }
  }, [defaultToFirst, programs, savedId]);

  const setSelectedId = (id: number | null) => {
    if (id !== null && !programs.some(program => program.id === id)) return;
    setSavedId(id);
    storeProgramId(id);
  };

  return [selectedId, setSelectedId] as const;
}
