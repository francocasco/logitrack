(function () {
  const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const REGEX_TELEFONO = /^\+?[\d\s\-\(\)]{6,}$/;
  const REGEX_PASSWORD = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  const REGEX_SOLO_LETRAS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
  const REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]{5,}/;
  const REGEX_TRACKING_ID = /^[A-Z]{2}-\d{6}$/;

  window.LogiTrackValidation = {
    REGEX_EMAIL,
    REGEX_TELEFONO,
    REGEX_PASSWORD,
    REGEX_SOLO_LETRAS,
    REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS,
    REGEX_TRACKING_ID,
  };
})();
