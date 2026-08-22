import * as React from 'react'
import type { ShareCardData } from '@/lib/share-card'

export function ProfileCardImage({ data }: { data: ShareCardData }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#12100e', color: '#f7f5f1', padding: '48px 56px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <span style={{ width: 14, height: 14, borderRadius: 20, background: '#ff5c1a' }} />
          <span style={{ fontSize: 18, letterSpacing: 4, fontWeight: 700 }}>AI MAXXING</span>
        </div>
        <span style={{ color: '#a8a09a', fontSize: 13, letterSpacing: 2.5 }}>{data.verificationLabel}</span>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 38, marginTop: 34 }}>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <span style={{ color: '#ff5c1a', fontSize: 14, letterSpacing: 2.5 }}>PUBLIC BUILD RECORD</span>
          <span style={{ marginTop: 8, fontSize: 48, lineHeight: 1, fontWeight: 700, letterSpacing: -2 }}>
            {data.handle}
          </span>
          {data.xHandle && <span style={{ marginTop: 9, color: '#a8a09a', fontSize: 17 }}>X {data.xHandle}</span>}

          <div style={{ display: 'flex', gap: 10, marginTop: 27 }}>
            {[data.toolLabel, data.projectLabel, `${data.tokens} tokens`].map((label) => (
              <span key={label} style={{
                border: '1px solid #ffffff24', color: '#d7d1cb',
                padding: '8px 10px', fontSize: 12, letterSpacing: 0.8,
              }}>{label}</span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 34, marginTop: 31 }}>
            <CardList label="TOOLS" values={data.tools} empty="Usage not connected" />
            <CardList label="MODELS" values={data.models} empty="Models not connected" />
            <CardList label="LIVE PROJECTS" values={data.projectTitles} empty="No websites selected" />
          </div>
        </div>

        <div style={{
          width: 295, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          border: '1px solid #ffffff24', background: '#1c1916', padding: '28px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a8a09a', fontSize: 12, letterSpacing: 2 }}>
            <span>AI INDEX</span><span>ACCOUNT</span>
          </div>
          <span style={{ color: '#ff5c1a', fontSize: 92, lineHeight: 1, fontWeight: 700, letterSpacing: -6 }}>
            {data.index}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid #ffffff24', paddingTop: 17 }}>
            <span style={{ color: '#a8a09a', fontSize: 11, letterSpacing: 1.5 }}>ACCOUNT SPEND</span>
            <span style={{ marginTop: 4, fontSize: 22, fontWeight: 700 }}>{data.spend}</span>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff20',
        paddingTop: 15, color: '#777069', fontSize: 12, letterSpacing: 1.2,
      }}>
        <span>TOOLS + TOKENS + OUTPUT + THINGS SHIPPED</span>
        <span>www.aimaxxing.lol/{data.handle}</span>
      </div>
    </div>
  )
}

function CardList({ label, values, empty }: { label: string; values: string[]; empty: string }) {
  return (
    <div style={{ display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column' }}>
      <span style={{ color: '#777069', fontSize: 10, letterSpacing: 1.8 }}>{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
        {values.length > 0
          ? values.map((value) => <span key={value} style={{ fontSize: 14 }}>{value}</span>)
          : <span style={{ color: '#777069', fontSize: 13 }}>{empty}</span>}
      </div>
    </div>
  )
}
