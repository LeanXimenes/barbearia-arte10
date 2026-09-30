/** Ícones em SVG inline — sem dependência externa, herdam a cor do texto. */

interface Props {
  tamanho?: number
  className?: string
}

const base = (tamanho: number) => ({
  width: tamanho,
  height: tamanho,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const IconeTesoura = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
)

export const IconeInicio = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </svg>
)

export const IconeCoroa = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
  </svg>
)

export const IconeCelular = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
  </svg>
)

export const IconeCompartilhar = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M12 3v12" />
    <polyline points="8 7 12 3 16 7" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)

export const IconeRelogio = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
)

export const IconeCalendario = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
)

export const IconeLocal = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

export const IconeWhatsapp = ({ tamanho = 20, className }: Props) => (
  <svg
    width={tamanho}
    height={tamanho}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
    className={className}
  >
    <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.03-.2-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.21-8.24 8.21Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.64 4.19 3.7.59.26 1.04.41 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.46-.29Z" />
  </svg>
)

export const IconeInstagram = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="3.6" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const IconeCheck = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export const IconeFechar = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

export const IconeVoltar = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

export const IconeAvancar = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

export const IconeAlerta = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="8" x2="12" y2="12.5" />
    <circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none" />
  </svg>
)

export const IconeAtualizar = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <polyline points="21 3 21 9 15 9" />
  </svg>
)

export const IconeUsuario = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
)
