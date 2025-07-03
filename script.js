document.addEventListener('DOMContentLoaded', () => {
    const shoppingForm = document.getElementById('shoppingForm');
    const itemNameInput = document.getElementById('itemName');
    const itemQuantityInput = document.getElementById('itemQuantity');
    const itemUnitSelect = document.getElementById('itemUnit');
    const shoppingList = document.getElementById('shoppingList');
    const printButton = document.getElementById('printButton');
    const whatsappButton = document.getElementById('whatsappButton');
    const clearListButton = document.getElementById('clearListButton');

    let items = [];

    // Fungsi untuk menampilkan item di daftar pada halaman web
    function renderShoppingList() {
        shoppingList.innerHTML = ''; // Kosongkan daftar sebelum merender ulang
        if (items.length === 0) {
            const emptyMessage = document.createElement('li');
            emptyMessage.textContent = 'Daftar belanja masih kosong.';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.fontStyle = 'italic';
            shoppingList.appendChild(emptyMessage);
        } else {
            items.forEach((item, index) => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <span>${item.name} (${item.quantity} ${item.unit})</span>
                    <button class="removeItem" data-index="${index}">X</button>
                `;
                shoppingList.appendChild(listItem);
            });
        }
    }

    // Menambahkan item ke daftar
    shoppingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemName = itemNameInput.value.trim();
        const itemQuantity = itemQuantityInput.value;
        const itemUnit = itemUnitSelect.value;

        if (itemName && itemQuantity) {
            items.push({ name: itemName, quantity: itemQuantity, unit: itemUnit });
            renderShoppingList();
            itemNameInput.value = '';
            itemQuantityInput.value = '';
            itemUnitSelect.value = 'Pcs'; // Reset ke Pcs
            itemNameInput.focus();
        }
    });

    // Menghapus item dari daftar
    shoppingList.addEventListener('click', (e) => {
        if (e.target.classList.contains('removeItem')) {
            const indexToRemove = parseInt(e.target.dataset.index);
            items.splice(indexToRemove, 1);
            renderShoppingList();
        }
    });

    // Membersihkan seluruh daftar
    clearListButton.addEventListener('click', () => {
        if (confirm('Apakah Anda yakin ingin menghapus semua item dari daftar?')) {
            items = [];
            renderShoppingList();
        }
    });

    // --- Fungsionalitas Printer Bluetooth ---
    // Penting: Interaksi dengan printer Bluetooth langsung dari browser memerlukan dukungan Web Bluetooth API.
    // Web Bluetooth API hanya berfungsi di browser yang mendukungnya (misalnya Chrome di Android, Chrome OS, macOS, Linux, Windows 10/11)
    // dan membutuhkan koneksi HTTPS.

    printButton.addEventListener('click', async () => {
        if (items.length === 0) {
            alert('Daftar belanja kosong, tidak ada yang bisa dicetak.');
            return;
        }

        if ('bluetooth' in navigator) {
            try {
                // Mencari perangkat Bluetooth dengan filter untuk printer thermal (Service UUID umum)
                // Anda mungkin perlu menyesuaikan serviceId atau name berdasarkan printer EPPOS Anda.
                const device = await navigator.bluetooth.requestDevice({
                    filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }], // Contoh Service UUID umum untuk printer
                    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] // Wajib untuk mengakses GATT services
                });

                const server = await device.gatt.connect();
                const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb'); // Sesuaikan Service UUID
                const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb'); // Sesuaikan Characteristic UUID (untuk menulis data)

                // ESC/POS Commands untuk formatting:
                // ESC @ = Initialize printer
                // ESC E 1 = Bold ON (untuk membuat teks tebal)
                // ESC E 0 = Bold OFF
                // GS ! n = Set character size (untuk memperbesar/memperkecil font)
                //      n = (height_multiplier << 4) | width_multiplier
                //      Misal: 0x00 (1x width, 1x height => default), 0x01 (2x width), 0x10 (2x height)
                // GS - n = Underline (n=1 untuk single, n=2 untuk double)
                // GS . = Cancel underline
                // ESC - n = Underline (n=1 untuk single, n=2 untuk double)
                // ESC 4 = Italic ON
                // ESC 5 = Italic OFF
                // 0x0A = Line Feed (new line)
                // 0x1D 0x56 0x41 0x00 = Full cut (pemotongan penuh)
                // 0x1D 0x56 0x42 0x00 = Partial cut (pemotongan sebagian)

                let printData = new Uint8Array([]);

                // 1. Inisialisasi Printer
                printData = new Uint8Array([...printData, 0x1B, 0x40]); // ESC @ - Initialize printer

                // 2. Header "Daftar Belanja Harinfood"
                // Aktifkan mode bold dan sedikit perbesar font untuk header
                printData = new Uint8Array([...printData,
                    0x1B, 0x45, 0x01,  // ESC E 1 - Aktifkan mode Bold
                    0x1D, 0x21, 0x01   // GS ! 0x01 - Set character size to 1x width, 2x height (ini akan memperbesar tinggi saja)
                                       // Atau coba 0x10 untuk 2x tinggi, 1x lebar
                                       // Atau 0x00 untuk ukuran default (1x1)
                ]);
                const header = "Daftar Belanja Harinfood\n";
                printData = new Uint8Array([...printData, ...new TextEncoder().encode(header)]);

                // Kembali ke ukuran font normal dan bold untuk item daftar
                printData = new Uint8Array([...printData,
                    0x1D, 0x21, 0x00, // GS ! 0x00 - Set character size back to default (1x width, 1x height)
                    0x0A, 0x0A        // Dua baris kosong setelah header
                ]);

                // 3. Item Belanja dengan Garis
                items.forEach((item, index) => {
                    const itemLine = `${item.name} (${item.quantity} ${item.unit})\n`;
                    printData = new Uint8Array([...printData, ...new TextEncoder().encode(itemLine)]);

                    // Tambahkan garis pemisah setelah setiap item
                    const lineSeparator = "--------------------------------\n"; // Sesuaikan panjang garis dengan lebar kertas
                    printData = new Uint8Array([...printData, ...new TextEncoder().encode(lineSeparator)]);
                });

                // 4. Footer
                const footer = "\nTerima kasih!\n\n\n";
                printData = new Uint8Array([...printData, ...new TextEncoder().encode(footer)]);
                printData = new Uint8Array([...printData, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A]); // Beberapa line feed tambahan

                await characteristic.writeValue(printData);
                alert('Daftar belanja berhasil dikirim ke printer!');

            } catch (error) {
                console.error('Error saat mencetak:', error);
                alert('Gagal terhubung atau mencetak. Pastikan printer menyala dan dalam mode pairing, serta browser mendukung Web Bluetooth API (gunakan HTTPS). ' + error.message);
            }
        } else {
            alert('Browser Anda tidak mendukung Web Bluetooth API. Silakan gunakan Chrome di perangkat yang mendukung.');
        }
    });

    // --- Fungsionalitas WhatsApp ---
    whatsappButton.addEventListener('click', () => {
        if (items.length === 0) {
            alert('Daftar belanja kosong, tidak ada yang bisa dikirim.');
            return;
        }

        let message = "Daftar Belanja Harinfood:\n\n";
        items.forEach(item => {
            message += `${item.name} (${item.quantity} ${item.unit})\n`;
        });
        message += "\nTerima kasih!";

        // Menggunakan URL encode untuk pesan agar aman saat dikirim
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    });

    // Inisialisasi tampilan daftar saat halaman dimuat
    renderShoppingList();
});
