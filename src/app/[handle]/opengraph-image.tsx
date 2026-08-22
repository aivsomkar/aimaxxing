import * as React from 'react'
import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getPublicProfile } from '@/lib/queries'
import { buildShareCardData, decodeShareHandle } from '@/lib/share-card'

export const alt = 'AI Maxxing developer profile'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamic = 'force-dynamic'

export default async function OpenGraphImage({ params }: { params: Promise<{ handle: string }> }) {
  const handle = decodeShareHandle((await params).handle)
  const profile = await getPublicProfile(handle)
  if (!profile) notFound()

  const card = buildShareCardData(profile)

  return new ImageResponse(
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#12100e', color: '#f7f5f1', padding: '54px 62px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 15, height: 15, borderRadius: 20, background: '#ff5c1a' }} />
          <span style={{ fontSize: 18, letterSpacing: 4, fontWeight: 700 }}>AI MAXXING</span>
        </div>
        <span style={{ color: '#a8a09a', fontSize: 14, letterSpacing: 3 }}>BUILDER PROFILE / 2026</span>
      </div>

      <div style={{ display: 'flex', flex: 1, marginTop: 46, gap: 58 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span style={{ color: '#ff5c1a', fontSize: 17, letterSpacing: 3 }}>PUBLIC BUILD RECORD</span>
          <span style={{ marginTop: 10, fontSize: 52, lineHeight: 1, fontWeight: 700, letterSpacing: -2 }}>
            {card.handle}
          </span>
          {card.xHandle && (
            <span style={{ marginTop: 12, color: '#a8a09a', fontSize: 20, letterSpacing: 1 }}>
              𝕏 {card.xHandle}
            </span>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 34 }}>
            {[card.toolLabel, card.projectLabel, card.verificationLabel].map((label) => (
              <span key={label} style={{
                border: '1px solid #ffffff20', padding: '10px 12px', color: '#c9c2bc',
                fontSize: 13, letterSpacing: 1.2,
              }}>{label}</span>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44 }}>
            <span style={{ color: '#a8a09a', fontSize: 13, letterSpacing: 2.5 }}>LIVE ON THE INTERNET</span>
            {card.projectTitles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14, gap: 10 }}>
                {card.projectTitles.map((title, index) => (
                  <div key={title} style={{ display: 'flex', alignItems: 'center', fontSize: 20 }}>
                    <span style={{ color: '#50c05f', marginRight: 12 }}>●</span>
                    <span style={{ color: '#a8a09a', marginRight: 12, fontSize: 13 }}>0{index + 1}</span>
                    {title}
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ marginTop: 14, color: '#6f6862', fontSize: 18 }}>Usage profile in progress</span>
            )}
          </div>
        </div>

        <div style={{
          width: 330, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          border: '1px solid #ffffff20', padding: '30px', background: '#1c1916',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a8a09a', fontSize: 13, letterSpacing: 2 }}>
            <span>AI INDEX</span><span>LIVE</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#ff5c1a', fontSize: 108, lineHeight: 0.9, fontWeight: 700, letterSpacing: -7 }}>
              {card.index}
            </span>
            <div style={{ width: '100%', height: 7, background: '#342e29', marginTop: 26, display: 'flex' }}>
              <div style={{ width: '72%', height: '100%', background: '#ff5c1a' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff20', paddingTop: 20 }}>
            <span style={{ color: '#a8a09a', fontSize: 13 }}>ACCOUNT SPEND</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{card.spend}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff20', paddingTop: 18, color: '#6f6862', fontSize: 13, letterSpacing: 1.5 }}>
        <span>TOOLS + OUTPUT + THINGS SHIPPED</span>
        <span>AIMAXXING.VERCEL.APP</span>
      </div>
    </div>,
    size,
  )
}
