import { NextResponse } from 'next/server';

// YÖNTEM 1: Birden fazla Overpass sunucusu (Round Robin)
// Eğer biri kısıtlanırsa (Rate Limit), diğerinden veri çekmeye devam etme şansımız artar.
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const s = searchParams.get('s');
    const w = searchParams.get('w');
    const n = searchParams.get('n');
    const e = searchParams.get('e');

    if (!s || !w || !n || !e) {
        return NextResponse.json({ error: 'Eksik koordinat parametreleri' }, { status: 400 });
    }

    const query = `
        [out:json][timeout:10];
        (
          node["amenity"~"cafe|restaurant|fast_food"]["name"](${s},${w},${n},${e});
        );
        out body;
    `;

    // Rastgele bir API ucu seçiyoruz
    const randomEndpoint = OVERPASS_ENDPOINTS[Math.floor(Math.random() * OVERPASS_ENDPOINTS.length)];
    const url = `${randomEndpoint}?data=${encodeURIComponent(query)}`;

    try {
        // YÖNTEM 2: Next.js Fetch Caching (Önbellekleme)
        // 'revalidate: 86400' -> Aynı koordinatlara gelen istekleri 24 saat (86400 saniye) boyunca 
        // Vercel/Next.js sunucu önbelleğinde tutar. Overpass'e hiç istek atılmaz!
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                // Overpass sunucuları botları engellememek için geçerli bir User-Agent bekler
                'User-Agent': 'KafMap-NextJS-App' 
            },
            next: { revalidate: 86400 } 
        });

        if (!response.ok) {
            // Sunucu meşgulse hata dön, frontend 15sn sonra tekrar denesin
            return NextResponse.json({ error: 'Overpass sunucusu yoğun' }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('API Route Hatası:', error);
        return NextResponse.json({ error: 'Sunucu hatası oluştu' }, { status: 500 });
    }
}