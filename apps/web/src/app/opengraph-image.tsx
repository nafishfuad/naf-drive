import { ImageResponse } from 'next/og';

export const alt = 'NAF Drive — all your clouds, one clean drive';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4f46e5 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 22,
              background: '#ffffff',
              color: '#4f46e5',
              fontSize: 64,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            N
          </div>
          <div style={{ fontSize: 72, fontWeight: 700 }}>NAF Drive</div>
        </div>
        <div style={{ fontSize: 42, opacity: 0.92 }}>
          All your clouds. One clean drive.
        </div>
        <div style={{ marginTop: 18, fontSize: 26, opacity: 0.65 }}>
          Google Drive · Dropbox · OneDrive — direct transfers, optional end-to-end encryption
        </div>
      </div>
    ),
    size,
  );
}
