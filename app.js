
const pressureElement = document.getElementById("pressure");
const bpmElement = document.getElementById("bpm");
const pressureNote = document.getElementById("pressureNote");
const modeLabel = document.getElementById("modeLabel");
const message = document.getElementById("message");
const historyElement = document.getElementById("history");
const demoButton = document.getElementById("demoBtn");
const stopButton = document.getElementById("stopBtn");
const canvas = document.getElementById("pressureChart");
const ctx = canvas.getContext("2d");

let currentMode = "NORMAL";
let demoRunning = false;
let demoTimer = null;
let pressureData = [];

function addEvent(text) {
  const item = document.createElement("div");
  item.className = "history-item";

  const time = new Date().toLocaleTimeString();

  item.innerHTML = `<span>${text}</span><span>${time}</span>`;

  historyElement.prepend(item);

  while (historyElement.children.length > 8) {
    historyElement.lastElementChild.remove();
  }
}

function setMode(mode) {
  currentMode = mode;

  document.querySelectorAll("[data-mode]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.mode === mode
    );
  });

  modeLabel.textContent = `Modo ${mode}`;

  if (mode === "NORMAL") {
    bpmElement.textContent = "70";
  } else if (mode === "TAQUI") {
    bpmElement.textContent = "120";
  } else {
    bpmElement.textContent = "45";
  }

  message.textContent =
    `Vista previa: modo ${mode}. No se envió al PIC.`;

  addEvent(`Modo de vista previa: ${mode}`);
}

document.querySelectorAll("[data-mode]").forEach(button => {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
  });
});

function drawChart() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;

  ctx.scale(devicePixelRatio, devicePixelRatio);

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "#263b4e";
  ctx.lineWidth = 1;

  for (let i = 1; i < 4; i++) {
    const y = (height / 4) * i;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (pressureData.length < 2) {
    return;
  }

  ctx.strokeStyle = "#45d6d0";
  ctx.lineWidth = 2;
  ctx.beginPath();

  pressureData.forEach((value, index) => {
    const x =
      (index / (pressureData.length - 1)) * width;

    const y =
      height - (value / 40) * height;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
}

function demoStep() {
  let pressure;

  if (currentMode === "NORMAL") {
    pressure = 12 + Math.random() * 3;
  } else if (currentMode === "TAQUI") {
    pressure = 16 + Math.random() * 4;
  } else {
    pressure = 8 + Math.random() * 2;
  }

  pressureElement.textContent = pressure.toFixed(1);
  pressureNote.textContent = "Dato simulado";

  pressureData.push(pressure);

  if (pressureData.length > 40) {
    pressureData.shift();
  }

  drawChart();
}

demoButton.addEventListener("click", () => {
  if (demoRunning) {
    clearInterval(demoTimer);
    demoRunning = false;

    demoButton.textContent = "INICIAR DEMOSTRACIÓN";
    message.textContent = "Demostración pausada.";

    addEvent("Demostración pausada");
    return;
  }

  demoRunning = true;

  demoButton.textContent = "PAUSAR DEMOSTRACIÓN";
  message.textContent =
    "Valores simulados. No corresponden al sensor real.";

  addEvent("Demostración iniciada");

  demoStep();
  demoTimer = setInterval(demoStep, 1000);
});

stopButton.addEventListener("click", () => {
  clearInterval(demoTimer);
  demoRunning = false;

  demoButton.textContent = "INICIAR DEMOSTRACIÓN";

  pressureElement.textContent = "--";
  bpmElement.textContent = "--";
  pressureNote.textContent = "Sin medición";
  modeLabel.textContent = "Sistema detenido";

  pressureData = [];
  drawChart();

  message.textContent =
    "Vista web detenida. No se envió una orden al PIC.";

  addEvent("Vista de demostración detenida");
});

drawChart();
