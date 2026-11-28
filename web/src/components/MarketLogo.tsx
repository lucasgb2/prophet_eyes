import { MARKETS, type MarketId } from '@/lib/markets';

/** Marca simples do mercado, desenhada aqui (não é o arquivo oficial da bolsa/corretora). */
export default function MarketLogo({ market }: { market: MarketId }) {
  const label = MARKETS[market].label;
  return (
    <svg className="mktlogo" viewBox="0 0 32 32" role="img" aria-label={label}>
      <title>{label}</title>
      {market === 'binance' ? (
        <>
          <rect width="32" height="32" rx="7" fill="#181a20" />
          <g fill="#f0b90b">
            <path d="M16 4.5 22.4 10.9 20 13.3 16 9.3 12 13.3 9.600 10.9Z" />
            <path d="M16 27.5 9.6 21.1 12 18.7 16 22.700 20 18.7 22.400 21.1Z" />
            <path d="M6.900 13.6 9.300 16 6.900 18.400 4.500 16Z" />
            <path d="M25.100 13.6 27.500 16 25.100 18.400 22.700 16Z" />
            <path d="M16 12.4 19.6 16 16 19.6 12.4 16Z" />
          </g>
        </>
      ) : (
        <>
          <rect width="32" height="32" rx="7" fill="#002f6c" />
          <text x="16" y="21.500" textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#fff">B3</text>
          <rect x="8" y="25" width="16" height="2" rx="1" fill="#00b0e6" />
        </>
      )}
    </svg>
  );
}
