import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface NavbarProps {
  onContactClick: () => void;
}

const Navbar = ({ onContactClick }: NavbarProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ 
        opacity: isVisible ? 1 : 0, 
        y: isVisible ? 0 : -100 
      }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border"
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <button 
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="text-xl font-bold hover:text-primary transition-colors"
        >
          Ini Karunwi
        </button>
        
        <div className="hidden md:flex items-center gap-8">
          <button onClick={() => scrollToSection("career")} className="text-sm hover:text-primary transition-colors">
            Career History
          </button>
          <button onClick={() => scrollToSection("projects")} className="text-sm hover:text-primary transition-colors">
            Projects
          </button>
          <button onClick={() => scrollToSection("speaking")} className="text-sm hover:text-primary transition-colors">
            Speaking
          </button>
          <button onClick={() => scrollToSection("teaching")} className="text-sm hover:text-primary transition-colors">
            Teaching
          </button>
          <span className="text-sm text-muted-foreground">joel.karunwini@gmail.com</span>
          <Button onClick={onContactClick} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Contact Me
          </Button>
        </div>
        
        <Button onClick={onContactClick} className="md:hidden bg-primary text-primary-foreground hover:bg-primary/90">
          Contact
        </Button>
      </div>
    </motion.nav>
  );
};

export default Navbar;
