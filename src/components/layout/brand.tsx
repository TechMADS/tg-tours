import Image from "next/image";

export function Brand() {
  return (
    <div className="w-full">
      <div className="dark:hidden">
        <Image
          src="/adn-logo-light.png"
          alt="ADN Adventures"
          width={655}
          height={390}
          className="h-auto w-full max-w-[184px] object-contain"
        />
      </div>
      <div className="hidden dark:block">
        <Image
          src="/adn-logo-dark.png"
          alt="ADN Adventures"
          width={1318}
          height={768}
          className="h-auto w-full max-w-[184px] object-contain"
        />
      </div>
    </div>
  );
}