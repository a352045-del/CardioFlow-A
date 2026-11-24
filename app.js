'use strict';
const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const UART_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
const $ = id => document.getElementById(id);
let device = null, gatt = null, txCharacteristic = null, rxCharacteristic = null;
let textDecoder = new TextDecoder(), incoming = '';

function setConnected(connected) {
  $('status').textContent = connected ? 'Conectado' : 'Sin conexión';
  $('status').className = 'status ' + (connected ? 'connected' : 'disconnected');
  document.querySelectorAll('[data-command]').forEach(b => b.disabled = !connected);
  $('stop').disabled = !connected;
}
function log(text) { $('log').textContent = text; }

async function sendCommand(command) {
  if (!txCharacteristic) { log('Primero conecta el JDY-3X.'); return; }
  try {
    const bytes = new TextEncoder().encode(command); // El PIC recibe el carácter N/T/B/S
    if (txCharacteristic.writeValueWithoutResponse) {
      await txCharacteristic.writeValueWithoutResponse(bytes);
    } else {
      await txCharacteristic.writeValue(bytes);
    }
    log('Comando enviado al módulo: ' + command);
  } catch (error) {
    log('No se pudo enviar el comando: ' + error.message);
  }
}

/* Compatibilidad con la telemetría del HEX previo:
   "P=12.3 kPa, ADC=456" y también con trama "CF;M=N;P10=123;ADC=456;A=0". */
function parseReceivedLine(line) {
  line = line.trim();
  if (!line) return;
  const structured = line.startsWith('CF;');
  if (structured) {
    const values = {};
    line.split(';').slice(1).forEach(part => {
      const pair = part.split('=');
      if (pair.length > 1) values[pair[0].trim()] = pair.slice(1).join('=').trim();
    });
    if (values.P10 !== undefined) showPressure(Number(values.P10) / 10);
    if (values.ADC !== undefined) $('adc').textContent = values.ADC;
    if (values.M !== undefined) $('mode').textContent = 'Modo: ' + values.M;
    const alarm = Number(values.A || 0);
    $('message').textContent = alarm === 1 ? 'Aviso: sensor' :
      alarm === 2 ? 'Aviso: presión alta' :
      alarm === 4 ? 'Aviso: presión baja' : 'Datos recibidos desde el PIC.';
    return;
  }
  const pressureMatch = line.match(/P\s*=\s*(-?\d+(?:\.\d+)?)/i);
  const adcMatch = line.match(/ADC\s*=\s*(\d+)/i);
  const modeMatch = line.match(/(?:MODO|MODE)\s*[:=]\s*(NORMAL|TAQUI|BRADI|STOP|[NTBS])/i);
  if (pressureMatch) showPressure(Number(pressureMatch[1]));
  if (adcMatch) $('adc').textContent = adcMatch[1];
  if (modeMatch) $('mode').textContent = 'Modo: ' + modeMatch[1];
  if (pressureMatch || adcMatch) $('message').textContent = 'Datos recibidos del firmware actual.';
  else $('message').textContent = 'Mensaje del PIC: ' + line.slice(0, 100);
}
function showPressure(value) {
  if (!Number.isFinite(value)) return;
  $('pressure').textContent = value.toFixed(1);
  $('meterfill').style.width = Math.max(0, Math.min(100, value / 40 * 100)) + '%';
}
function onNotification(event) {
  incoming += textDecoder.decode(event.target.value);
  const lines = incoming.split(/\r?\n/);
  incoming = lines.pop() || '';
  lines.forEach(parseReceivedLine);
}
async function connectBluetooth() {
  if (!navigator.bluetooth) {
    $('connection-help').textContent = 'Este navegador no admite Web Bluetooth. Abre la página en Chrome o Edge actual, usando un enlace HTTPS.';
    return;
  }
  try {
    log('Buscando dispositivos Bluetooth…');
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID]
    });
    device.addEventListener('gattserverdisconnected', () => {
      txCharacteristic = null; rxCharacteristic = null; gatt = null;
      setConnected(false);
      $('connection-help').textContent = 'El JDY se desconectó. Puedes volver a conectar.';
      log('Bluetooth desconectado.');
    });
    gatt = await device.gatt.connect();
    const service = await gatt.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(UART_UUID);
    txCharacteristic = characteristic;
    rxCharacteristic = characteristic;
    if (rxCharacteristic.properties.notify || rxCharacteristic.properties.indicate) {
      await rxCharacteristic.startNotifications();
      rxCharacteristic.addEventListener('characteristicvaluechanged', onNotification);
    }
    setConnected(true);
    $('connection-help').textContent = 'Conectado a ' + (device.name || 'JDY-3X') + '. Ya puedes probar los botones.';
    log('Enlace GATT conectado. Enviando STOP inicial.');
    await sendCommand('S');
  } catch (error) {
    setConnected(false);
    log('No se pudo conectar: ' + error.message);
    $('connection-help').textContent = 'Si no aparece el JDY, confirma que esté encendido y no conectado a otro teléfono o computadora.';
  }
}
$('connect').addEventListener('click', connectBluetooth);
document.querySelectorAll('[data-command]').forEach(button => {
  button.disabled = true;
  button.addEventListener('click', () => sendCommand(button.dataset.command));
});
$('stop').addEventListener('click', () => sendCommand('S'));
setConnected(false);
