const APP_ADS_CONTENT = 'google.com, pub-7057041881494735, DIRECT, f08c47fec0942fa0\n'

export function GET() {
  return new Response(APP_ADS_CONTENT, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  })
}
