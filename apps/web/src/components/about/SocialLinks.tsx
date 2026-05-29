import { Linkedin } from 'lucide-react';

type SocialLinksProps = {
  className?: string;
};

export function SocialLinks({ className }: SocialLinksProps) {
  const rootClassName = className
    ? `about-social-links ${className}`
    : 'about-social-links';

  return (
    <div className={rootClassName}>
      <a
        className="about-coffee-link"
        href="https://www.buymeacoffee.com/mjsmckenzie"
        target="_blank"
        rel="noreferrer"
      >
        <img
          src="https://img.buymeacoffee.com/button-api/?text=Buy my kids a cakepop!&emoji=%F0%9F%A7%81&slug=mjsmckenzie&button_colour=5F7FFF&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00"
          alt="Buy my kids a cakepop!"
        />
      </a>
      <a
        className="about-linkedin-card"
        href="https://www.linkedin.com/in/mjsmckenzie/"
        target="_blank"
        rel="noreferrer"
        aria-label="Follow Matthew Swing-McKenzie on LinkedIn"
      >
        <span className="about-linkedin-card-icon" aria-hidden="true">
          <Linkedin size={17} />
        </span>
        <span className="about-linkedin-card-copy">
          <strong>Follow on LinkedIn</strong>
        </span>
        <span className="about-linkedin-card-cta" aria-hidden="true">
          View profile
        </span>
      </a>
    </div>
  );
}
