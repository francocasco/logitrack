const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONO = /^\+?[\d\s\-\(\)]{6,}$/;
const REGEX_PASSWORD = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const REGEX_SOLO_LETRAS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
const REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]{5,}/;
const REGEX_NOMBRE_PERSONA = /^[A-Za-zÁÉÍÓÚáéíóúÑñ]{3,}(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]{3,})+$/;
const REGEX_DIRECCION = /^(?=(?:.*[A-Za-zÁÉÍÓÚáéíóúÑñ]){3,})(?=.*\s)(?=.*\d)[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s.,#-]+$/;
const REGEX_PRODUCTO = /^(?=(?:.*[A-Za-zÁÉÍÓÚáéíóúÑñ]){5,})[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s.,#-]+$/;

module.exports = {
  REGEX_EMAIL,
  REGEX_TELEFONO,
  REGEX_PASSWORD,
  REGEX_SOLO_LETRAS,
  REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS,
  REGEX_NOMBRE_PERSONA,
  REGEX_DIRECCION,
  REGEX_PRODUCTO,
};
