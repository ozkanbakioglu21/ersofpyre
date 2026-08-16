import { createFileRoute, Link } from "@tanstack/react-router";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Era of Pyre — Ejderha Biniciliği Aksiyon-RPG GDD" },
      {
        name: "description",
        content:
          "Era of Pyre: Steampunk / Dark Fantasy evreninde geçen ejderha biniciliği, hava savaşı ve yeryüzü yıkımı odaklı Aksiyon-RPG oyununun detaylı Game Design Document taslağı.",
      },
      { property: "og:title", content: "Era of Pyre — Game Design Document" },
      {
        property: "og:description",
        content:
          "Ejderha süvarilerinin kül kaplı gökyüzünde steampunk zeplin filolarına karşı verdiği savaşın tasarım dokümanı.",
      },
    ],
  }),
  component: Index,
});

const nav = [
  ["hikaye", "01 · Hikâye & Evren"],
  ["moddlar", "02 · Savaş Modları"],
  ["kontroller", "03 · Uçuş & Alev"],
  ["magaza", "04 · Ejderha Garajı"],
  ["dusmanlar", "05 · Düşmanlar"],
  ["intro", "06 · İntro Bölümü"],
] as const;

function Section({
  id,
  index,
  title,
  lead,
  children,
}: {
  id: string;
  index: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border/60 py-16">
      <p className="font-display text-sm tracking-[0.35em] text-primary">{index}</p>
      <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 max-w-3xl text-muted-foreground">{lead}</p>}
      <div className="mt-8 space-y-6">{children}</div>
    </section>
  );
}

function Card({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/60">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-semibold text-foreground">{title}</h3>
        {tag && (
          <span className="rounded-full border border-primary/40 px-3 py-1 text-xs uppercase tracking-widest text-primary">
            {tag}
          </span>
        )}
      </div>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </article>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="relative isolate overflow-hidden">
        <img
          src={hero}
          alt="Kül bulutları arasında zeplin filosuna dalan ejderha süvarisi"
          width={1920}
          height={1088}
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "var(--gradient-ash)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-5xl px-6 py-28 sm:py-40">
          <p className="font-display text-xs tracking-[0.45em] text-accent">
            GAME DESIGN DOCUMENT · V0.9 TASLAK
          </p>
          <h1 className="mt-6 text-5xl font-black uppercase tracking-tight text-foreground sm:text-7xl">
            Era of <span className="text-primary">Pyre</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-foreground/80">
            Kül çağında geçen bir Ejderha Biniciliği / Hava Savaşı / Sandbox Yıkım Aksiyon-RPG'si.
            Gökyüzü steampunk kalelerin, yeryüzü ise alevlerin egemenliğinde.
          </p>
          <div className="mt-8">
            <Link
              to="/oyna"
              className="inline-flex items-center rounded-md bg-primary px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-primary-foreground shadow-[var(--shadow-ember)] transition-opacity hover:opacity-90"
            >
              Prototipi Oyna →
            </Link>
          </div>
          <dl className="mt-10 grid gap-4 sm:grid-cols-4">
            {[
              ["Tür", "Aerial Combat / ARPG"],
              ["Perspektif", "3. Şahıs, 360° uçuş"],
              ["Platform", "PC & Konsol"],
              ["Mod", "PvE + PvP"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-card/70 p-4 backdrop-blur">
                <dt className="text-xs uppercase tracking-widest text-primary">{k}</dt>
                <dd className="mt-1 text-sm text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <nav className="sticky top-0 z-10 border-y border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl gap-6 overflow-x-auto px-6 py-3 text-xs uppercase tracking-widest">
          {nav.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="whitespace-nowrap text-muted-foreground transition-colors hover:text-primary"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <Section
          id="hikaye"
          index="01"
          title="Ana Hikâye ve Era of Pyre Evreni"
          lead="Dünya bir çağ önce 'Büyük Tutuşma' ile küle döndü. İnsanlık, zehirli kül denizinin üstüne buharla yükselen mekanik kaleler kurdu; ejderhalar ise yeryüzünün son sahipleri olarak alevin altında kaldı."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Büyük Tutuşma" tag="Arka plan">
              <p>
                Ashkeep Loncası, yeraltındaki "Köz Damarları"nı buhar enerjisine çevirmek için
                kadim ejderha yuvalarını deldi. Damarlar patladı; kıta üç yıl boyunca yandı ve
                gökyüzü kalıcı bir kül tabakasıyla kapandı. Bu ana <em>Era of Pyre</em> deniyor.
              </p>
              <p>
                Güneşi kaybeden insanlık, kül tabakasının üstüne çıkmak için zeplin şehirleri ve
                yürüyen fabrika kuleleri inşa etti. Yaşamak için hâlâ yeryüzünden köz madenciliği
                yapıyorlar — yani ejderhaların yuvalarını kazımaya devam ediyorlar.
              </p>
            </Card>
            <Card title="Oyuncu: Kayra, Son Köz Süvarisi" tag="Protagonist">
              <p>
                Oyuncu, loncanın yıktığı bir yuvanın tek sağ kalanı olan genç bir süvaridir. Yavru
                ejderhası <strong>Pyra</strong> ile birlikte büyür; oyunun ilerleyişi ikisinin bağı
                (Bond Level) üzerinden anlatılır.
              </p>
              <p>
                Ana dram: Kayra'nın amacı intikam mı, yoksa köz damarlarını mühürleyip çağı
                bitirmek mi? 3 farklı finale götüren "Kül / Köz / Şafak" seçim ekseni.
              </p>
            </Card>
            <Card title="Antagonist: Yüksek Kâhya Vorren" tag="Boss">
              <p>
                Ashkeep Loncası'nın baş mühendisi. Uçan amiral gemisi <strong>Sovereign Cinder</strong>
                bir şehir büyüklüğündedir ve son bölümün çok fazlı boss'udur. Vorren kendini ejderha
                kemiği ve pirinç protezlerle "ölümsüzleştirmiştir".
              </p>
            </Card>
            <Card title="Ton & Görsel Yön" tag="Art direction">
              <Bullets
                items={[
                  "Palet: kömür siyahı, pas kahvesi, pirinç sarısı; tek vurgu rengi kor kırmızı.",
                  "Sis ve kül partikülleri mesafe hissini taşır; ışık kaynağı çoğunlukla yangınlardır.",
                  "Ses: derin buhar homurtusu, metal gıcırtısı, alev püskürtmede alçak frekanslı basınç patlaması.",
                ]}
              />
            </Card>
          </div>
        </Section>

        <Section
          id="moddlar"
          index="02"
          title="3 Ana Savaş Modu ve Oynanış Döngüsü"
          lead="Her mod aynı çekirdek döngüyü besler: Uç → Yık/Yen → XP + Kadim Köz kazan → Ejderha ve ekipman yükselt → Daha zor bölge aç."
        >
          <Card title="1. Yeryüzü Yıkımı" tag="PvE Sandbox">
            <p>
              Açık bir kül vadisine iniş yaparsın; hedef listesi yerine <strong>Yıkım Yüzdesi</strong>
              vardır. %60'ı geçmek bölümü tamamlar, %100 bonus köz verir.
            </p>
            <Bullets
              items={[
                "Döngü (3-6 dk): Bölgeye dal → yangını başlat → yangının yayılmasını rüzgârla yönet → savunma kuleleri uyanır → onları temizle → tahliye zeplinini düşür → çıkış.",
                "Yangın yayılma sistemi: ahşap köyler zincirleme yanar, taş fabrikalar ise doğrudan alev basıncı ister. Oyuncu 'akıllı yakarak' daha az stamina harcar.",
                "Kaos Çarpanı: art arda yıkım kombosu (5 sn içinde yeni hedef) çarpanı x1 → x5 yükseltir, XP'yi katlar.",
                "Aşırı ısınma riski: uzun alev tutuşu ejderhanın Heat barını doldurur, soğutma için yüksek irtifada süzülmek gerekir.",
              ]}
            />
          </Card>
          <Card title="2. Gökyüzü Hakimiyeti" tag="PvE Hikâye & Boss">
            <p>
              Elle tasarlanmış, hava sahası temelli hikâye görevleri. Kapalı arena değil; devasa
              zeplinlerin etrafında dönen "yörünge savaşı" tasarımı.
            </p>
            <Bullets
              items={[
                "Döngü (8-15 dk): Filoya yaklaş → avcı ejderha eskortunu dağıt → zeplinin zayıf noktalarını (buhar bacaları, balon hücreleri, top yuvaları) tek tek imha et → iç güverteye dal → çekirdek kazanı patlat.",
                "Zayıf nokta sistemi: her boss'ta 4-6 modül; hangi sırayla imha ettiğin boss'un davranışını değiştirir (topları önce alırsan yakın dövüş moduna geçer).",
                "Faz kırılması: %50 canda zeplin düşmeye başlar, savaş serbest düşüşte devam eder — dikey kaos anı.",
                "Hikâye ödülü: yeni ejderha yumurtası, bölge açılışı ve ekipman şeması.",
              ]}
            />
          </Card>
          <Card title="3. Ejderha Arenası" tag="Online PvP">
            <p>1v1 düello ve 3v3 takım savaşı; beceri tavanı manevra ve stamina yönetimidir.</p>
            <Bullets
              items={[
                "Döngü (4-7 dk): Hazırlık (ejderha + eyer seçimi, ban aşaması) → konumlanma → enerji/termal kolonlarını kapma → angajman → kaçınma savaşı → bitiriş.",
                "Harita objeleri: yükselen sıcak hava kolonları hız verir, kül fırtınası görünürlüğü keser, kayan taş adalar siper olur.",
                "Denge: PvP'de ekipman istatistikleri normalize edilir; kozmetikler dışında pay-to-win yoktur. Fark oyuncu becerisidir.",
                "Sıralama: Kül → Kor → Alev → Ejderha Lordu ligleri, sezonluk sıfırlama ve estetik alev ödülleri.",
              ]}
            />
          </Card>
        </Section>

        <Section
          id="kontroller"
          index="03"
          title="Uçuş Kontrolleri, Manevra ve Alev Mekanikleri"
          lead="Tam 360° serbestlik; simülasyon değil, 'ağır ama tatmin edici' arcade fizik. Hız korunumu (momentum) sistemin kalbidir."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Temel Uçuş" tag="Momentum">
              <Bullets
                items={[
                  "Sol çubuk: pitch & roll. Sağ çubuk: kamera / serbest bakış. Yaw omuz tuşlarıyla.",
                  "Kanat çırpma (A / X): stamina harcar, ani ivme verir; 3 ardışık çırpış 'Sprint' moduna sokar.",
                  "Süzülme (glide): kanatları kilitler, stamina yenilenir, hız yavaş düşer — keşif ve soğuma için.",
                  "Dik dalış (dive): burnu aşağı çevirip hız kazanma; çıkışta bu hız 'slingshot' ivmesine dönüşür.",
                  "Hover: yerde/alçakta askıda kalma, hassas yıkım için; stamina hızla erir.",
                ]}
              />
            </Card>
            <Card title="Kaçınma ve Savunma" tag="Skill">
              <Bullets
                items={[
                  "Barrel roll: yön + kaçınma tuşu; 0.4 sn dokunulmazlık penceresi, kısa cooldown.",
                  "Immelmann / split-S: kilitlenmiş düşmanı arkana almak için hızlı yön tersine çevirme.",
                  "Kanat kalkanı: kanatları öne kapatarak öndeki topçu ateşini emme; hareketi yavaşlatır.",
                  "Perfect dodge: son 0.1 sn'de kaçınma stamina'yı geri verir ve kısa 'Ember Rush' hızı sağlar.",
                ]}
              />
            </Card>
            <Card title="Alev Püskürtme" tag="Heat sistemi">
              <Bullets
                items={[
                  "Konik Alev (basılı tut): geniş alan, düşük tekil hasar — köy/orman yakmak için ideal.",
                  "Köz Mermisi (tap): yoğun tek atış, zeplin modüllerini kırar; hafif yerçekimi düşüşü var.",
                  "Magma Kusma (şarjlı): 2 sn şarj, yere düştüğü yerde yanan havuz bırakır.",
                  "Heat barı %100 olursa 8 sn boyunca alev kilitlenir; yüksek irtifa veya su üstünde süzülme soğutur.",
                ]}
              />
            </Card>
            <Card title="Ejderha Öfkesi (Ultimate)" tag="Meter">
              <p>
                Hasar vererek ve mükemmel kaçınmalarla dolan bar. Aktifleştiğinde 12 sn boyunca
                Heat birikmez, alev menzili %50 artar ve ekran kül fırtınasıyla kararır.
                Ejderha sınıfına göre ultimate farklıdır: Magma için "Kül Yağmuru", Gölge için
                "Sessiz Uçuş" (görünmezlik), Fırtına için "Şimşek Dalışı".
              </p>
            </Card>
          </div>
        </Section>

        <Section
          id="magaza"
          index="04"
          title="Ejderha Garajı, Ekipman ve İlerleme"
          lead="Seviye atlama yeni sınıfların kilidini açar; Kadim Köz (Ancient Embers) satın almayı, 'Kalıntı Parçası' ise yükseltmeyi sağlar. Maksimum seviye 60, ejderha başına 10 kademe yükseltme."
        >
          <div className="grid gap-5 md:grid-cols-3">
            <Card title="Zephyra — Fırtına Ejderhası" tag="Lv. 1 · Hızlı">
              <Bullets
                items={[
                  "Hız 9/10 · Manevra 10/10 · Zırh 3/10 · Alev 5/10",
                  "Pasif: Kanat çırpma stamina maliyeti -25%.",
                  "Rol: PvP düello ve hızlı yıkım koşuları.",
                  "Ultimate: Şimşek Dalışı — düz hatta elektrik izi bırakan süper dalış.",
                ]}
              />
            </Card>
            <Card title="Vulkanar — Magma Ejderhası" tag="Lv. 15 · Ağır">
              <Bullets
                items={[
                  "Hız 4/10 · Manevra 3/10 · Zırh 10/10 · Alev 10/10",
                  "Pasif: Heat barı %40 daha yavaş dolar; alev alan hasarı yüksektir.",
                  "Rol: Yeryüzü Yıkımı ve zeplin kuşatması.",
                  "Ultimate: Kül Yağmuru — geniş alana düşen yanan meteorlar.",
                ]}
              />
            </Card>
            <Card title="Noxbane — Gölge Ejderhası" tag="Lv. 30 · Taktik">
              <Bullets
                items={[
                  "Hız 7/10 · Manevra 8/10 · Zırh 5/10 · Alev 7/10",
                  "Pasif: Kül bulutunda görünmez kalır, radar kilitlenmesini kırar.",
                  "Rol: 3v3 PvP baskını, boss zayıf noktası avı.",
                  "Ultimate: Sessiz Uçuş — 8 sn görünmezlik, çıkışta kritik alev.",
                ]}
              />
            </Card>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Eyerler (Saddles)" tag="Ekipman">
              <Bullets
                items={[
                  "Pirinç Kaçak Eyeri: +12% stamina yenilenmesi, -5% zırh.",
                  "Kazan Eyeri: Heat kapasitesi +20%, alev süresi uzar.",
                  "Fırtına Kayışı: barrel roll cooldown -30%, mükemmel kaçınma penceresi +0.05 sn.",
                  "Her eyerin 3 yuvası var: hız / stamina / heat mücevheri takılabilir.",
                ]}
              />
            </Card>
            <Card title="Zırh & Kozmetik" tag="Özelleştirme">
              <Bullets
                items={[
                  "Göğüs zırhı: canı ve top ateşine direnci artırır, ağırlık ekleyip manevrayı düşürür.",
                  "Kanat zırhı: kanat kalkanı dayanıklılığı; ağır kanat dalış hızını artırır ama dönüşü keser.",
                  "Süvari kostümleri: düşme hasarı, iniş sonrası yer dövüşü ve hikâye diyalog seçenekleri açar.",
                  "Estetik alev efektleri (mavi köz, yeşil kükürt, beyaz kül) sadece görseldir — PvP dengesi bozulmaz.",
                ]}
              />
            </Card>
          </div>
          <Card title="Ekonomi Dengesi" tag="Progression">
            <Bullets
              items={[
                "Bir Yıkım görevi ~450 köz, bir boss görevi ~1.800 köz, PvP galibiyeti ~300 köz + lig puanı.",
                "Yeni sınıf ejderha 12.000-25.000 köz; yükseltmeler kademe başına artan maliyet (500 → 6.000).",
                "Günlük 3 sözleşme (contract) oyuncuyu üç mod arasında dolaştırır, tek moda hapsolmayı önler.",
              ]}
            />
          </Card>
        </Section>

        <Section
          id="dusmanlar"
          index="05"
          title="Düşman Çeşitliliği"
          lead="Düşmanlar üç katmanda tasarlanır: hava (zeplin & avcı), dikey (kuleler) ve yer (yapılar & robotlar). Her katman farklı bir mekaniği zorlar."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Hava — Zeplinler" tag="Katman 1">
              <Bullets
                items={[
                  "Avcı Zeplini 'Wasp': küçük, hızlı, sürü hâlinde; harpun atar ve ejderhayı yavaşlatır.",
                  "Toplu Firkateyn 'Bulwark': yan bataryalarla ateş duvarı kurar; alttan yaklaşmayı zorlar.",
                  "Taşıyıcı 'Aviary': mekanik ornitopter filosu üretir; hangar kapıları imha edilmeli.",
                  "Amiral Gemisi 'Sovereign Cinder': şehir büyüklüğünde çok fazlı final boss'u.",
                ]}
              />
            </Card>
            <Card title="Dikey — Mekanik Kuleler" tag="Katman 2">
              <Bullets
                items={[
                  "Tesla Sarmalı: menzilinde zincirleme elektrik, sürekli hareket etmeyi zorunlu kılar.",
                  "Flak Kulesi: irtifaya göre patlayan mermi; alçak uçuşu ödüllendirir.",
                  "Işıldak Kulesi: seni işaretler, tüm bölge ateşini üstüne çeker — önce yok edilmeli hedefi.",
                  "Zincir Mancınığı: kanatlara dolanan zincir, kurtulmak için barrel roll spam'i ister.",
                ]}
              />
            </Card>
            <Card title="Yer — Yapılar" tag="Katman 3">
              <Bullets
                items={[
                  "Ahşap köy evleri: hızlı tutuşur, yangın yayılma zinciri başlatır.",
                  "Fabrika bacaları ve buhar kazanları: patladığında çevreye alan hasarı verir, kombo besler.",
                  "Kül ormanları: rüzgâr yönüne göre yayılan yangın; en verimli Kaos Çarpanı kaynağı.",
                  "Köz madeni asansörleri: imhası hikâye ilerlemesini açan öncelikli hedefler.",
                ]}
              />
            </Card>
            <Card title="Yer — Buhar Devleri" tag="Mini-boss">
              <Bullets
                items={[
                  "Yürüyen Kule 'Colossus': sırtındaki soğutma kanatları açıldığında zayıf çekirdek görünür.",
                  "Örümcek Rafineri: yere kül gazı yayar, alçak uçuşu cezalandırır.",
                  "Harpun Devi: ejderhayı yere çeker ve kısa bir yer dövüşü sekansı başlatır.",
                ]}
              />
            </Card>
          </div>
        </Section>

        <Section
          id="intro"
          index="06"
          title="İntro Bölümü: 'Kül Perdesinin Ardında'"
          lead="Hedef: 10-12 dakikada uçuşu, alevi, kaçınmayı ve yıkımı öğretmek; oyunun tonunu ilk 60 saniyede kurmak. Tutorial UI minimumdur — mekanikler baskı altında öğretilir."
        >
          <Card title="Sahne Akışı" tag="Beat sheet">
            <Bullets
              items={[
                "00:00 — Kara ekranda buhar sesi. Kayra, yanan yuvasının kenarında Pyra'nın sırtında uyanır. Kamera kül bulutunun altından yukarı doğru yükselir.",
                "00:45 — Serbest uçuş: oyuncu kül kanyonundan geçer. Halkalardan değil, dar kaya geçitlerinden uçarak pitch/roll öğrenir.",
                "02:30 — İlk alev: yolu kapatan ahşap bir madenci köprüsü yakılır. Konik alev ve Heat barı tanıtılır.",
                "04:00 — Kül perdesi yarılır: üstte 6 gemilik Ashkeep keşif filosu belirir. Sinematik: Pyra kükrer, müzik girer.",
                "05:00 — Baskın başlar: Wasp avcıları harpunla saldırır; ilk zorunlu barrel roll burada öğretilir (yavaşlatılmış zaman ipucu).",
                "07:00 — İlk zeplin: 'Bulwark' firkateyni. Oyuncu yan bataryaları geçip balon hücrelerini Köz Mermisi ile patlatır. Zayıf nokta sistemi tanıtılır.",
                "09:00 — Dalış anı: düşen firkateyn oyuncuyu aşağı sürükler; scripted dive sekansı slingshot ivmesini öğretir.",
                "10:30 — Vorren'in sesi tüm filoya yayılır: 'Son yuva da söndü.' Amiral gemisi Sovereign Cinder kül perdesinin ardından belirir — dev ölçek gösterilir ama savaş yapılmaz.",
                "11:30 — Kaçış: Pyra yaralanır, oyuncu düşerek Kül Vadisi'ne iniş yapar. Burası hub alanı ve Ejderha Garajı'nın açılış sahnesidir. İlk seviye atlama ve ilk 500 Kadim Köz verilir.",
              ]}
            />
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Öğretilen Mekanikler" tag="Tutorial">
              <Bullets
                items={[
                  "Pitch/roll/yaw ve süzülme (kanyon geçidi)",
                  "Konik alev + Heat yönetimi (köprü)",
                  "Barrel roll ve mükemmel kaçınma (harpun avcıları)",
                  "Köz Mermisi ve zayıf nokta hedefleme (firkateyn)",
                  "Dalış-slingshot momentum (düşüş sekansı)",
                ]}
              />
            </Card>
            <Card title="Başarı Kriterleri" tag="Metrik">
              <Bullets
                items={[
                  "Oyuncuların %90'ı bölümü ilk denemede bitirmeli; ölüm cezası yok, sadece geri sarma.",
                  "İlk alev püskürtme 3 dakikadan önce gerçekleşmeli (gücün hazzı erken hissedilmeli).",
                  "Bölüm sonunda oyuncu üç modun da nasıl hissettirdiğine dair bir önizleme görmüş olmalı.",
                ]}
              />
            </Card>
          </div>
        </Section>
      </main>

      <footer className="border-t border-border py-10 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Era of Pyre · GDD Taslak v0.9 · Kül söner, köz kalır
      </footer>
    </div>
  );
}
