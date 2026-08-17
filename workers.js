addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
    const url = new URL(request.url)

    if (url.hostname.startsWith('www.')) {
        const cleanHostname = url.hostname.replace('www.', '')
        return Response.redirect(`${url.protocol}//${cleanHostname}${url.pathname}${url.search}`, 301)
    }

    let path = url.pathname

    if (path === '/' || path === '/index.html') {
        path = '/login.html'
    }

    const backendTarget = 'https://identification-best-leasing-runtime.trycloudflare.com'

    if (path.startsWith('/api/') || path.startsWith('/socket.io/')) {
        return fetch(`${backendTarget}${path}${url.search}`, request)
    }

    const githubBase = 'https://raw.githubusercontent.com/iOSVIDocumentation/ichatter/main'

    try {
        const response = await fetch(`${githubBase}${path}`)
        if (response.status === 200) {
            const newResponse = new Response(response.body, response)

            newResponse.headers.set('Access-Control-Allow-Origin', '*')

            newResponse.headers.set(
                'Content-Security-Policy',
                "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.trycloudflare.com https://cdn.socket.io wss://*.trycloudflare.com;"
            )

            if (path.endsWith('.css')) {
                newResponse.headers.set('Content-Type', 'text/css; charset=utf-8')
            } else if (path.endsWith('.js')) {
                newResponse.headers.set('Content-Type', 'application/javascript; charset=utf-8')
            } else if (path.endsWith('.html')) {
                newResponse.headers.set('Content-Type', 'text/html; charset=utf-8')
            }

            return newResponse
        }

        return new Response(`Cannot GET ${url.pathname} (Убедитесь, что файл лежит в корне репозитория GitHub в ветке main)`, { status: 404 })
    } catch (err) {
        return new Response(`Ошибка сети Воркера: ${err.message}`, { status: 500 })
    }
}
