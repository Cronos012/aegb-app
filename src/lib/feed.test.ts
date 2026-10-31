import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { summarize } = await import('./feed')

const me = 'moi'
const rows = [
  { kind: 'jaime' as const, member_id: 'autre' },
  { kind: 'jadore' as const, member_id: me },
  { kind: 'soutien' as const, member_id: null, official: true },
]

describe('summarize', () => {
  it("sépare ma réaction de celle de l'AEGB", () => {
    const s = summarize(rows, me)
    expect(s.total).toBe(3)
    expect(s.mine).toBe('jadore')
    expect(s.aegb).toBe('soutien')
  })

  it("change la réaction de l'AEGB sans toucher à la mienne", () => {
    const s = summarize(rows, me, undefined, 'rire')
    expect(s.mine).toBe('jadore')
    expect(s.aegb).toBe('rire')
    expect(s.total).toBe(3)
  })

  it("retire ma réaction sans retirer celle de l'AEGB", () => {
    const s = summarize(rows, me, null)
    expect(s.mine).toBeNull()
    expect(s.aegb).toBe('soutien')
    expect(s.total).toBe(2)
  })
})
