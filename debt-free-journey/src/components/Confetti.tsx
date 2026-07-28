'use client'

import { useEffect, useState } from 'react'

interface Piece {
  id: number
  left: number
  delay: number
  duration: number
  color: string
}

/** Lightweight CSS confetti burst. Re-fires whenever `burst` increments. */
export function Confetti({ burst }: { burst: number }) {
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    if (!burst) return
    const style = getComputedStyle(document.documentElement)
    const colors = [1, 2, 3, 4, 5, 6].map((i) => `rgb(${style.getPropertyValue(`--chart-${i}`).trim() || '99 102 241'})`)
    const next = Array.from({ length: 80 }, (_, i) => ({
      id: burst * 1000 + i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 2 + Math.random() * 2,
      color: colors[i % colors.length],
    }))
    setPieces(next)
    const t = setTimeout(() => setPieces([]), 4800)
    return () => clearTimeout(t)
  }, [burst])

  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </>
  )
}
