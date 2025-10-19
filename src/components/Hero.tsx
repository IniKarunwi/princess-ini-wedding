import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Linkedin, BookOpen, Mail } from "lucide-react";
import headshot from "@/assets/ini-profile.jpg";
import { Button } from "@/components/ui/button";

const Hero = () => {
  const fullName = "Ini Karunwi.";
  const [displayedName, setDisplayedName] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const startDelay = 400;
    const charDelay = 65; // 60-70ms per character
    
    const timeout = setTimeout(() => {
      let currentIndex = 0;
      
      const typeInterval = setInterval(() => {
        if (currentIndex < fullName.length) {
          setDisplayedName(fullName.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(typeInterval);
          setIsComplete(true);
          // Fade out cursor after completion
          setTimeout(() => setShowCursor(false), 500);
        }
      }, charDelay);

      return () => clearInterval(typeInterval);
    }, startDelay);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <section 
      className="min-h-screen flex items-center justify-center pt-16 pb-12 relative overflow-hidden"
      style={{ backgroundColor: '#0B0F0C' }}
    >
      {/* Faint radial gradient glow */}
      <div 
        className="absolute top-1/2 right-1/2 w-[1000px] h-[1000px] rounded-full pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle, rgba(159,255,96,0.05) 0%, transparent 70%)',
          filter: 'blur(80px)',
          transform: 'translate(50%, -50%)'
        }}
      />
      
      {/* Vertical gradient behind text */}
      <div 
        className="absolute inset-0 pointer-events-none -z-10"
        style={{
          background: 'linear-gradient(180deg, rgba(11,15,12,0.95), rgba(18,22,18,0.8))'
        }}
      />

      {/* Centered container with max-width: 1200px and side padding 24px */}
      <div className="max-w-[1200px] mx-auto px-6 relative z-10 w-full">
        {/* 2-column grid: 5fr / 7fr (image / text) with 40px gap */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Profile Photo - Left Side (5fr on desktop) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="lg:col-span-5 flex justify-center lg:justify-start"
          >
            <motion.div
              animate={{ 
                boxShadow: [
                  '0 0 20px rgba(159, 255, 96, 0.35)',
                  '0 0 30px rgba(159, 255, 96, 0.5)',
                  '0 0 20px rgba(159, 255, 96, 0.35)'
                ]
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="rounded-full lg:-ml-[60px]"
            >
              <img 
                src={headshot} 
                alt="Ini Karunwi profile photo" 
                className="rounded-full object-cover border-2 border-primary/30"
                style={{
                  width: 'clamp(280px, 28vw, 440px)',
                  height: 'clamp(280px, 28vw, 440px)'
                }}
              />
            </motion.div>
          </motion.div>

          {/* Text Content - Right Side (7fr on desktop) */}
          <div className="lg:col-span-7 flex flex-col gap-6 text-center lg:text-left">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-bold leading-tight"
            style={{ 
              fontSize: 'clamp(36px, 5vw, 54px)',
              lineHeight: '1.1',
              color: '#FFFFFF'
            }}
          >
            Hi, I'm{" "}
            <span 
              className="inline-block transition-all duration-300 hover:brightness-105"
              style={{ color: '#9FFF60' }}
            >
              {displayedName}
              {showCursor && (
                <span 
                  className="inline-block ml-0.5 w-0.5 h-[0.9em] bg-current align-middle animate-pulse"
                  style={{ 
                    opacity: isComplete ? 0 : 1,
                    transition: 'opacity 0.5s ease-out'
                  }}
                />
              )}
            </span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl font-medium tracking-wide"
            style={{ color: '#B3B3B3' }}
          >
            Product & Project Manager • No-Code Developer
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, type: "spring" }}
            className="flex flex-wrap items-center justify-center md:justify-start gap-3"
          >
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10 transition-all duration-300"
            >
              <a
                href="https://www.linkedin.com/in/inioluwa-karunwi/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Linkedin className="w-4 h-4" />
                <span>LinkedIn</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10 transition-all duration-300"
            >
              <a
                href="https://medium.com/@ini-karunwi"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                <span>Medium</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10 transition-all duration-300"
            >
              <a
                href="mailto:joel.karunwini@gmail.com"
                className="flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span>Email Me</span>
              </a>
            </Button>
          </motion.div>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-xl md:text-2xl font-semibold leading-relaxed"
            style={{ color: '#EAEAEA', lineHeight: '1.5' }}
          >
            Experienced Product & Project Manager (4+ years). Helped scale{" "}
            <a 
              href="https://www.toptal.com/no-code" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline transition-all"
            >
              WeLoveNoCode
            </a>
            {" "}from $500k → $3M ARR. Founding member of{" "}
            <a 
              href="https://www.proptechbuzz.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline transition-all"
            >
              ProptechBuzz.com
            </a>
            {" "}— connecting 15,000+ innovators across 20+ countries.
          </motion.p>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-sm leading-relaxed mt-2"
            style={{ color: '#777777' }}
          >
            Collaborated with{" "}
            <a 
              href="https://aerdf.org/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-all"
            >
              AERDF
            </a>
            {" "}(Bill & Melinda Gates Foundation) on global education innovation initiatives.
          </motion.p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
