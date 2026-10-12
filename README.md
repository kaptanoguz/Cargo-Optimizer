# Cargo Optimizer

M/T X (IMO 9000001, IBC ship type 2, 12 cargo tanks) için kimyasal tanker stowage planlayıcısı.
Kurulum gerekmez, internet gerekmez: `index.html` dosyasını tarayıcıda açın.

## Optimizasyon hedefi (öncelik sırasıyla)
1. **Maksimum yük** yerleştir (sığmayan her ton en ağır ceza).
2. **Minimum tank** kullan; kullanılan tanklarda **minimum boş hacim** bırak (best-fit).
3. **Slack tank yok**: ayarlanabilir eşiğin (varsayılan %65) altında dolu tank ağır cezalı — iki tankta %35 yerine tek tankta %70 seçilir.
4. Meyil: karşı taraftaki boş balastla düzeltilebilecek kısım hafif, ötesi ağır cezalı; düzeltme için balast önerisi verilir.
5. P/S çift tercih, slop tankları son çare.

Sert kısıtlar: tank başına tek parsel, parsel bazlı doldurma limiti, uyumsuz parseller arasında ortak perde yok, kilitli tanklara dokunulmaz.

Algoritma: her parsel için "minimal yeterli" tank alt kümeleri (12 tank → 4096 alt küme, kapasite DP) + P/S simetrik kapanışları; en kısıtlı parsel önce, kapasite alt sınırlı branch & bound. Tipik süre 10–800 ms.

## Hesaplar
- **Yoğunluk/VCF**: petrol ürünleri ASTM Table 54B, luboil / base oil ASTM Table 54D (15 °C), kimyasal/bitkisel yağlar ürün genleşme katsayısı β. Yöntem formda elle değiştirilebilir.
- **Doldurma limiti** = min(98 % × ρ(seferdeki max sıcaklık) / ρ(yükleme sıcaklığı), 98 % × 1.54 / ρ).
- **Ağırlık**: vakumda veya havada (WCF −0.0011).
- **Uyumluluk**: USCG 46 CFR 150 Figure 1 reaktif grup tablosu (istisnalı çiftler uyarı olarak gösterilir) + ısıya duyarlı ürünlerin ısıtılan yüke komşuluğu (stiren, VAM, akrilonitril…).
- **DWT**: T/S/W yükleme hattı bölgesi elle seçilir, isteğe bağlı draft kısıtlı DWT.

## Manuel düzenleme
- Tanka tıkla → %, m³ veya ton yaz; slider; adım (0.5–100, t/m³/%); "Fill to limit", "Match pair", "Even out", "Empty".
- **Keep parcel totals** açıkken bir tankta yapılan değişiklik aynı parselin diğer tanklarına aktarılır; parsel toplamı sabit kalır.
- Tank tablosundaki her hücre düzenlenebilir; parsel seçimi açılır listeden.
- Parseli tanka sürükle-bırak; tankı tanka sürükleyerek taşı/takas et.
- Tank kilidi: Optimise kilitli tankları korur. Yeni parsel eklemek mevcut planı bozmaz (yalnızca boş tanklara istiflenir).
- **DWT**: nominasyonlar deadweight'i aşarsa Optimise uyarır ve tüm parselleri orantılı küçültmek için onay ister (Cancel → tam nominasyon, DWT aşımı uyarısıyla). Optimizer mevcut balastın P/S dengesizliğini de hesaba katar.
- Geri al / yinele (Ctrl+Z / Ctrl+Y), otomatik kayıt, JSON kaydet/aç, CSV, A4 yatay yazdırma (imza blokları).

## Temalar
Chart (kâğıt, varsayılan) · Bridge (koyu) · Night (kırmızı, gece görüşü) · Auto.

## Test
```bash
npm test          # hesap / optimizer testleri (Node)
npm run test:ui   # tarayıcı duman testi (yüklü Chrome; ya da CHROMIUM_PATH=/yol/chromium)
```

## Masaüstü sürüm (Tauri)
`npm run tauri build` — `dist-web/` her derlemede `index.html`, `css/`, `js/` dosyalarından yeniden üretilir (`npm run build:web`); elle düzenlemeyin.

> Düzenleyici veriler planlama yardımcısıdır; geminin Certificate of Fitness'ı, güncel IBC Code Ch.17/18, USCG tablosu ve kiracı/yükleyici talimatları esastır.
