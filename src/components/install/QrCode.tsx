import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** Un code QR dessiné en SVG, net à toutes les tailles. */
export function QrCode({ value, size = 104, className = '' }: { value: string; size?: number; className?: string }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { count: n, path: d }
  }, [value])
  return (
    <svg viewBox={`-2 -2 ${count + 4} ${count + 4}`} width={size} height={size} className={className} role="img" aria-label={`Code QR vers ${value}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={count + 4} height={count + 4} fill="#fff" />
      <path d={path} fill="#12162B" />
    </svg>
  )
}
