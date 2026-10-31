import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { boldParts, notificationTime, sections } = await import('./notifications')
type Notification = import('./notifications').Notification

const note = (id: number, created_at: string): Notification => ({
  id,
  category: 'fil',
  icon: 'reaction',
  text: '',
  link: '/app/fil',
  official: false,
  chip: null,
  created_at,
  read: false,
  others: 0,
  actor: null,
})

// Vendredi 30 octobre 2026, 15 h à Paris.
const now = new Date('2026-10-30T14:00:00Z')

describe('notificationTime', () => {
  it('compte en minutes, puis en heures le même jour', () => {
    expect(notificationTime('2026-10-30T13:59:40Z', now)).toBe("À l'instant")
    expect(notificationTime('2026-10-30T13:48:00Z', now)).toBe('Il y a 12 min')
    expect(notificationTime('2026-10-30T11:00:00Z', now)).toBe('Il y a 3 h')
  })

  it('dit « Hier », puis le jour, puis la date', () => {
    expect(notificationTime('2026-10-29T20:00:00Z', now)).toBe('Hier')
    expect(notificationTime('2026-10-27T09:00:00Z', now)).toBe('Mardi')
    expect(notificationTime('2026-10-12T09:00:00Z', now)).toBe('12 oct.')
  })
})

describe('sections', () => {
  it('range par jour et laisse tomber les groupes vides', () => {
    const list = [note(1, '2026-10-30T09:00:00Z'), note(2, '2026-10-28T09:00:00Z'), note(3, '2026-10-01T09:00:00Z')]
    expect(sections(list, now).map((s) => [s.title, s.items.map((n) => n.id)])).toEqual([
      ["Aujourd'hui", [1]],
      ['Cette semaine', [2]],
      ['Plus tôt', [3]],
    ])
    expect(sections([note(4, '2026-10-01T09:00:00Z')], now).map((s) => s.title)).toEqual(['Plus tôt'])
  })
})

describe('boldParts', () => {
  it('sépare le gras du reste', () => {
    expect(boldParts('**Aïssatou Diallo** a réagi à ta publication')).toEqual([
      { text: 'Aïssatou Diallo', bold: true },
      { text: ' a réagi à ta publication', bold: false },
    ])
    expect(boldParts('Rien en gras')).toEqual([{ text: 'Rien en gras', bold: false }])
  })
})
