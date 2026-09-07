import Image from 'next/image';

interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'default' | 'full';
  alt?: string;
}

export function Logo({ size = 40, className = '', variant = 'default', alt = 'OmniKès' }: LogoProps) {
  const width = variant === 'full' ? 200 : size;
  const height = variant === 'full' ? 60 : size;

  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/branding/omnikes-logo.jpeg"
        alt={alt}
        width={width}
        height={height}
        className="object-contain"
        style={{ width: 'auto', height: 'auto' }}
        priority
      />
    </div>
  );
}
