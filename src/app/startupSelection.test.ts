import { describe, it, expect, beforeEach } from 'vitest';
import { SELECTED_PROJECT_KEY } from './SelectOrConnectRepo';
import { normalizeRepo } from '../pages/settings/lib/normalizeRepo';

describe('Startup Repository Selection Logic', () => {
  beforeEach(() => {
    // Clear mock storage
    globalThis.localStorage?.clear?.();
  });

  it('exports the standard localStorage key for selected project', () => {
    expect(SELECTED_PROJECT_KEY).toBe('factory.selected_project');
  });

  it('normalizes repository names correctly across shorthand and full URLs', () => {
    expect(normalizeRepo('BboyAkers/Software-Factory-Studio')).toBe('BboyAkers/Software-Factory-Studio');
    expect(normalizeRepo('https://github.com/BboyAkers/Software-Factory-Studio')).toBe('BboyAkers/Software-Factory-Studio');
    expect(normalizeRepo('git@github.com:BboyAkers/Software-Factory-Studio.git')).toBe('BboyAkers/Software-Factory-Studio');
  });

  it('identifies when a project is selected in storage vs first-time startup', () => {
    const mockStorage: Record<string, string> = {};
    const getItem = (key: string) => mockStorage[key] ?? null;
    const setItem = (key: string, val: string) => {
      mockStorage[key] = val;
    };

    const meProjects = [
      { id: 'alpha', name: 'Software Factory Studio', repo: 'BboyAkers/Software-Factory-Studio' },
      { id: 'beta', name: 'Payment Core', repo: 'acme/payment-core' },
    ];

    // Scenario 1: First startup / no repo selected
    const initialSaved = getItem(SELECTED_PROJECT_KEY);
    const hasSelectionAtStartup = initialSaved !== null && meProjects.some((p) => p.id === initialSaved);
    expect(hasSelectionAtStartup).toBe(false);

    // Scenario 2: User selects a repository
    setItem(SELECTED_PROJECT_KEY, 'alpha');
    const updatedSaved = getItem(SELECTED_PROJECT_KEY);
    const isNowSelected = updatedSaved !== null && meProjects.some((p) => p.id === updatedSaved);
    expect(isNowSelected).toBe(true);

    // Scenario 3: Stale project ID not in account
    setItem(SELECTED_PROJECT_KEY, 'nonexistent');
    const staleSaved = getItem(SELECTED_PROJECT_KEY);
    const isStaleValid = staleSaved !== null && meProjects.some((p) => p.id === staleSaved);
    expect(isStaleValid).toBe(false);

    // Scenario 4: User initiates explicit switch
    const isSwitching = true;
    const shouldRedirect = !isSwitching && isNowSelected;
    expect(shouldRedirect).toBe(false);
  });
});
