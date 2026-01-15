export function validarTelefone(raw: any) {
  if (!raw) return { ok: false };

  // remove tudo que não for número
  const digits = String(raw).replace(/\D/g, "");

  // exatamente 11 dígitos
  if (digits.length !== 11) return { ok: false };

  // valida DDD + celular
  const regex = /^(1[1-9]|[2-9][0-9])9\d{8}$/;
  if (!regex.test(digits)) return { ok: false };

  // formata
  const formatted = `(${digits.slice(0, 2)}) ${digits.slice(
    2,
    7
  )}-${digits.slice(7)}`;

  return {
    ok: true,
    raw: digits,
    formatted,
  };
}

export function validarArquivo(file: File) {
  const permitido = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]

  if (!permitido.includes(file.type)) {
    throw new Error('Arquivo inválido. Envie um XLSX.')
  }

  // Ex: limite de 2MB
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Arquivo muito grande.')
  }
}
