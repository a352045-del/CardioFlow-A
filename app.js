'use strict';

// Comunicación BLE UART. El PIC recibe N/T/B/S por UART.
// Perfil frecuente en módulos JDY UART: servicio FFE0 y característica FFE1.
const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const UART_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

const $ = id => document.getElementById(id);
const pressureElement = $('pressure');
const bpmElement = $('bpm');
const pressureNote = $('pressureNote');
const modeLabel = $('modeLabel');
const message = $('message');
const historyElement = $('history');
const stopButton = $('stopBtn');
const connectButton = $('connectBtn');
const canvas = $('pressureChart');
const ctx = canvas.getContext('2d');

let device = null;
let gattServer = null;
let uartCharacteristic = null;
let incomingText = '';
let pressureData = [];
let textDecoder = new TextDecoder();

function addEvent(description) {
  const item = document.createElement('div');
  item.className = 'history-item';
  const label = document.createElement('span');
  const time = document.createElement('span');
  label.textContent = description;
  time.textContent = new Date().toLocaleTimeString();
  item.append(label, time);
  historyElement.prepend(item);
  while (historyElement.children.length > 8) {
    historyElement.lastElementChild.remove();
  }
}

function setConnectionState(state, detail) {
  const connected = state === 'connected';
  const badge = $('systemBadge');
  const dot = $('connectionDot');

  badge.textContent = connected ? 'CONECTADO' :
    state === 'error' ? 'ERROR DE CONEXIÓN' : 'DESCONECTADO';
  badge.className = 'badge ' + state;
  dot.className = 'dot ' + state;
  $('connectionStatus').textContent = connected
    ? (device?.name || 'JDY-3X conectado')
    : state === 'error' ? 'No se pudo conectar' : 'JDY-3X desconectado';

  connectButton.textContent = connected ? 'DESCONECTAR' : 'CONECTAR';
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.disabled = !connected;
  });
  stopButton.disabled = !connected;
  $('connectionNote').textContent = detail || (connected
    ? 'Enlace Bluetooth activo.'
    : 'Usa Chrome o Edge y activa el JDY-3X.');
}

function setMessage(text) {
  message.textContent = text;
}

async function sendCommand(command, label) {
  if (!uartCharacteristic || !device?.gatt?.connected) {
    setMessage('No hay conexión Bluetooth. Conecta el JDY-3X primero.');
    return false;
  }
  try {
    const bytes = new TextEncoder().encode(command);
    if (uartCharacteristic.properties.writeWithoutResponse &&
        uartCharacteristic.writeValueWithoutResponse) {
      await uartCharacteristic.writeValueWithoutResponse(bytes);
    } else if (uartCharacteristic.properties.write &&
               uartCharacteristic.writeValueWithResponse) {
      await uartCharacteristic.writeValueWithResponse(bytes);
    } else {
      await uartCharacteristic.writeValue(bytes);
    }
    setMessage(`Orden ${label} enviada al JDY-3X.`);
    addEvent(`Orden enviada: ${label}`);
    return true;
  } catch (error) {
    setMessage(`Error al enviar ${label}: ${error.message}`);
    addEvent(`Error al enviar ${label}`);
    return false;
  }
}

function updatePressure(value) {
  if (!Number.isFinite(value)) return;
  pressureElement.textContent = value.toFixed(1);
  pressureNote.textContent = 'Lectura recibida desde el PIC';
  pressureData.push(value);
  if (pressureData.length > 40) pressureData.shift();
  $('chartStatus').textContent = 'Recibiendo datos';
  drawChart();
}

function parseReceivedLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  // Formato que transmite el firmware actual: P=12.3 kPa, ADC=456
  const pressureMatch = line.match(/P\s*=\s*(-?\d+(?:\.\d+)?)/i);
  const adcMatch = line.match(/ADC\s*=\s*(\d+)/i);
  if (pressureMatch) updatePressure(Number(pressureMatch[1]));
  if (adcMatch) {
    addEvent(`ADC recibido: ${adcMatch[1]}`);
  }

  // Reconoce respuesta de confirmación sencilla del firmware.
  if (/^OK\b/i.test(line)) {
    setMessage('El PIC respondió OK a través del enlace Bluetooth.');
    return;
  }

  if (pressureMatch || adcMatch) {
    setMessage('Datos recibidos desde el PIC por Bluetooth.');
  } else {
    setMessage(`Dato recibido: ${line.slice(0, 100)}`);
  }
}

function handleNotification(event) {
  incomingText += textDecoder.decode(event.target.value);
  const lines = incomingText.split(/\r?\n/);
  incomingText = lines.pop() || '';
  lines.forEach(parseReceivedLine);
}

async function connectBluetooth() {
  if (!navigator.bluetooth) {
    setConnectionState('error', 'Web Bluetooth no está disponible. Abre este enlace HTTPS en Chrome o Edge desde un equipo compatible.');
    setMessage('Este navegador no admite Web Bluetooth.');
    return;
  }

  try {
    connectButton.disabled = true;
    setMessage('Buscando el JDY-3X. Selecciónalo en la ventana Bluetooth…');

    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID]
    });

    device.addEventListener('gattserverdisconnected', onDisconnected);
    gattServer = await device.gatt.connect();

    const service = await gattServer.getPrimaryService(SERVICE_UUID);
    uartCharacteristic = await service.getCharacteristic(UART_UUID);

    if (uartCharacteristic.properties.notify || uartCharacteristic.properties.indicate) {
      await uartCharacteristic.startNotifications();
      uartCharacteristic.addEventListener('characteristicvaluechanged', handleNotification);
    }

    setConnectionState('connected', `Conectado a ${device.name || 'JDY-3X'}. Ya puedes enviar órdenes.`);
    setMessage('Bluetooth conectado. Los controles están habilitados.');
    addEvent(`Bluetooth conectado: ${device.name || 'JDY-3X'}`);
    // Se manda STOP al conectar para iniciar en estado detenido.
    await sendCommand('S', 'DETENER (inicial)');
  } catch (error) {
    uartCharacteristic = null;
    gattServer = null;
    setConnectionState('error', 'No se completó la conexión. Verifica que el JDY-3X esté encendido y no conectado a otro dispositivo.');
    setMessage(`No se pudo conectar: ${error.message}`);
    addEvent('Falló la conexión Bluetooth');
  } finally {
    connectButton.disabled = false;
  }
}

function onDisconnected() {
  uartCharacteristic = null;
  gattServer = null;
  incomingText = '';
  setConnectionState('disconnected', 'El JDY-3X se desconectó. Puedes volver a conectarlo.');
  setMessage('Conexión Bluetooth perdida. Los controles quedaron deshabilitados.');
  addEvent('Bluetooth desconectado');
}

async function disconnectBluetooth() {
  if (device?.gatt?.connected) device.gatt.disconnect();
  onDisconnected();
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', async () => {
    const mode = button.dataset.mode;
    const command = { NORMAL: 'N', TAQUI: 'T', BRADI: 'B' }[mode];
    if (await sendCommand(command, mode)) {
      document.querySelectorAll('[data-mode]').forEach(item => {
        item.classList.toggle('active', item.dataset.mode === mode);
      });
      modeLabel.textContent = `Orden enviada: ${mode}`;
      // El firmware actual no transmite una frecuencia real; no inventamos un BPM.
      bpmElement.textContent = '--';
    }
  });
});

stopButton.addEventListener('click', async () => {
  if (await sendCommand('S', 'DETENER')) {
    document.querySelectorAll('[data-mode]').forEach(item => item.classList.remove('active'));
    modeLabel.textContent = 'Orden de detención enviada';
    bpmElement.textContent = '--';
  }
});

connectButton.addEventListener('click', () => {
  if (device?.gatt?.connected) disconnectBluetooth();
  else connectBluetooth();
});

function drawChart() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = '#263b4e';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (pressureData.length < 2) return;
  const minValue = Math.min(0, ...pressureData);
  const maxValue = Math.max(40, ...pressureData);
  const range = Math.max(1, maxValue - minValue);
  ctx.strokeStyle = '#45d6d0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  pressureData.forEach((value, index) => {
    const x = (index / (pressureData.length - 1)) * width;
    const y = height - ((value - minValue) / range) * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

window.addEventListener('resize', drawChart);
setConnectionState('disconnected');
drawChart();
