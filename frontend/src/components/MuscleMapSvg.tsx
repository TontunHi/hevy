import { useState } from 'react'
import Body, { type ExtendedBodyPart, type Slug } from 'react-muscle-highlighter'
import type { MuscleDetail } from '../api'

const SLUG_TO_HEVY: Partial<Record<Slug, string[]>> = {
  chest: ['chest'],
  deltoids: ['shoulders'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearm: ['forearms'],
  abs: ['abdominals'],
  obliques: ['abdominals'],
  adductors: ['adductors'],
  quadriceps: ['quadriceps'],
  calves: ['calves'],
  trapezius: ['traps'],
  'upper-back': ['upper_back', 'lats'],
  gluteal: ['glutes'],
  hamstring: ['hamstrings'],
}

function fillFor(rate: number): string {
  if (rate <= 0) return '#222228'
  if (rate < 5) return '#1e3a5f'
  if (rate < 10) return '#2563eb'
  if (rate <= 20) return '#3fc07a'
  return '#eab308'
}

export function MuscleMapSvg({
  muscles,
  selected,
  onSelect,
}: {
  muscles: MuscleDetail[]
  selected: string
  onSelect: (muscle: string) => void
}) {
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const byName = new Map(muscles.map((m) => [m.muscle, m]))

  const data: ExtendedBodyPart[] = (Object.entries(SLUG_TO_HEVY) as [Slug, string[]][]).map(
    ([slug, hevyKeys]) => {
      const rates = hevyKeys.map((k) => byName.get(k)?.weekly_rate ?? 0)
      const rate = Math.max(...rates, 0)
      const isSelected = hevyKeys.includes(selected)
      return {
        slug,
        styles: {
          fill: fillFor(rate),
          stroke: isSelected ? '#ffffff' : '#121215',
          strokeWidth: isSelected ? 1.8 : 0.7,
        },
      }
    },
  )

  const handlePress = (part: ExtendedBodyPart) => {
    if (!part.slug) return
    const candidates = SLUG_TO_HEVY[part.slug]
    if (!candidates || candidates.length === 0) return
    if (candidates.length === 1) {
      onSelect(candidates[0])
      return
    }
    // Toggle between upper_back and lats when clicking the back torso region
    const next = selected === candidates[0] ? candidates[1] : candidates[0]
    onSelect(next)
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span className="sub-cell">Click any muscle fiber to inspect</span>
        <div className="segmented" role="group" aria-label="Body model">
          <button aria-pressed={gender === 'male'} onClick={() => setGender('male')}>
            Male
          </button>
          <button aria-pressed={gender === 'female'} onClick={() => setGender('female')}>
            Female
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
          justifyItems: 'center',
          alignItems: 'center',
          padding: '8px 0',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className="sub-cell" style={{ marginBottom: 4 }}>
            Anterior
          </div>
          <Body
            data={data}
            side="front"
            gender={gender}
            scale={0.88}
            border="#2b2b33"
            defaultFill="#1b1b20"
            defaultStroke="#121215"
            defaultStrokeWidth={0.6}
            hiddenParts={['hair']}
            onBodyPartPress={handlePress}
          />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div className="sub-cell" style={{ marginBottom: 4 }}>
            Posterior
          </div>
          <Body
            data={data}
            side="back"
            gender={gender}
            scale={0.88}
            border="#2b2b33"
            defaultFill="#1b1b20"
            defaultStroke="#121215"
            defaultStrokeWidth={0.6}
            hiddenParts={['hair']}
            onBodyPartPress={handlePress}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--faint)',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span>Weekly set intensity</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          0
          {['#222228', '#1e3a5f', '#2563eb', '#3fc07a', '#eab308'].map((c) => (
            <span
              key={c}
              style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }}
            />
          ))}
          10–20 / &gt;20
        </span>
      </div>
    </div>
  )
}
