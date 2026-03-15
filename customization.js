const birdColorPicker = document.getElementById('birdColorPicker');
const birdSizeSlider = document.getElementById('birdSizeSlider');
const pipeColorPicker = document.getElementById('pipeColorPicker');
const bgColorPicker = document.getElementById('bgColorPicker');
const voiceControlToggle = document.getElementById('voiceControlToggle');

const birdImageUpload = document.getElementById('birdImageUpload');
const pipeImageUpload = document.getElementById('pipeImageUpload');
const bgImageUpload = document.getElementById('bgImageUpload');

const flapSoundUpload = document.getElementById('flapSoundUpload');
const crashSoundUpload = document.getElementById('crashSoundUpload');
const storageWarning = document.getElementById('storageWarning');

birdColorPicker.value = localStorage.getItem('birdColor') || '#fce205';
birdSizeSlider.value = localStorage.getItem('birdSize') || '1.0';
pipeColorPicker.value = localStorage.getItem('pipeColor') || '#54b256';
bgColorPicker.value = localStorage.getItem('bgColor') || '#70c5ce';
voiceControlToggle.checked = localStorage.getItem('voiceMode') === 'true';

birdColorPicker.addEventListener('input', (e) => localStorage.setItem('birdColor', e.target.value));
birdSizeSlider.addEventListener('input', (e) => localStorage.setItem('birdSize', e.target.value));
pipeColorPicker.addEventListener('input', (e) => localStorage.setItem('pipeColor', e.target.value));
bgColorPicker.addEventListener('input', (e) => localStorage.setItem('bgColor', e.target.value));
voiceControlToggle.addEventListener('change', (e) => localStorage.setItem('voiceMode', e.target.checked));

function handleUpload(inputEl, key) {
    inputEl.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2.5 * 1024 * 1024) {
                storageWarning.innerText = "File too large! Must be under 2.5MB.";
                storageWarning.style.display = 'block';
                return;
            }
            storageWarning.style.display = 'none';
            
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    localStorage.setItem(key, event.target.result);
                } catch (err) {
                    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                        storageWarning.innerText = "Storage quota exceeded. Clear some files or use smaller files.";
                        storageWarning.style.display = 'block';
                    }
                }
            }
            reader.readAsDataURL(file);
        }
    });
}

handleUpload(birdImageUpload, 'birdImage');
handleUpload(pipeImageUpload, 'pipeImage');
handleUpload(bgImageUpload, 'bgImage');
handleUpload(flapSoundUpload, 'flapSound');
handleUpload(crashSoundUpload, 'crashSound');

document.getElementById('startGameBtn').addEventListener('click', () => {
    window.location.href = './game.html';
});

document.getElementById('resetDefaultsBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.reload();
});
