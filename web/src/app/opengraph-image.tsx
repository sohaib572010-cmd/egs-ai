import { ImageResponse } from 'next/og';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

export const alt = 'EGS AI - AI tutor for the Egyptian curriculum';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const FEATURES = ['AI Tutor', 'Voice Tutor', 'Quizzes & Exams', 'Smart Flashcards', 'Photo Solver'];

export default async function Image() {
  const logo = await readFile(join(process.cwd(), 'public', 'logo.png'), 'base64');
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px',
          background: 'linear-gradient(135deg, #0D1B2A 0%, #1E2E3D 60%, #2a1a4a 100%)',
          color: '#F8F9FA'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img elements */}
          <img src={`data:image/png;base64,${logo}`} alt="EGS AI" width={120} height={120} style={{ borderRadius: '28px' }} />
          <div style={{ display: 'flex', fontSize: 92, fontWeight: 800 }}>
            <span>EGS</span>
            <span style={{ color: '#00B4D8', marginLeft: '18px' }}>AI</span>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 44, marginTop: '36px', color: '#FFB703', fontWeight: 700 }}>
          The AI tutor for the Egyptian curriculum
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '44px' }}>
          {FEATURES.map(f => (
            <div
              key={f}
              style={{
                display: 'flex',
                fontSize: 28,
                padding: '12px 26px',
                borderRadius: '999px',
                border: '2px solid rgba(0, 180, 216, 0.6)',
                background: 'rgba(114, 9, 183, 0.25)'
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
