import { motion } from "framer-motion";
import { Linkedin, BookOpen, Mail } from "lucide-react";
import headshot from "@/assets/headshot.jpeg";
import rocketDrawing from "@/assets/rocket-drawing.png";
import { Button } from "@/components/ui/button";

const Hero = () => {
  return (
    <section className="min-h-screen flex items-center justify-center px-6 pt-24 pb-16 relative overflow-hidden">
      {/* Gradient Glows */}
      <div 
        className="absolute top-0 right-0 w-[900px] h-[900px] md:w-[1200px] md:h-[1200px] rounded-full pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle, #9FFF60 0%, transparent 70%)',
          opacity: 0.06,
          filter: 'blur(100px)',
          transform: 'translate(30%, -30%)'
        }}
      />
      <div 
        className="absolute bottom-0 left-0 w-[900px] h-[900px] md:w-[1100px] md:h-[1100px] rounded-full pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle, #6AA6FF 0%, transparent 70%)',
          opacity: 0.05,
          filter: 'blur(120px)',
          transform: 'translate(-35%, 35%)'
        }}
      />
      
      {/* Rocket Drawing Background */}
      <img 
        src={rocketDrawing}
        alt=""
        className="absolute top-1/2 right-0 w-[600px] h-[600px] md:w-[700px] md:h-[700px] pointer-events-none -z-10"
        style={{
          transform: 'translate(20%, -50%) rotate(15deg)',
          opacity: 0.15,
          mixBlendMode: 'overlay'
        }}
      />

      <div className="max-w-6xl mx-auto relative z-10 flex flex-col md:flex-row items-center gap-12 md:gap-16">
        {/* Avatar - Left Side */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="flex-shrink-0"
        >
          <img 
            src={headshot} 
            alt="Ini Karunwi" 
            className="w-72 h-72 md:w-[400px] md:h-[400px] rounded-full object-cover border-4 border-primary shadow-[0_0_80px_rgba(159,255,96,0.4)]"
          />
        </motion.div>

        {/* Text Content - Right Side */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex-1 text-center md:text-left"
        >
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4">
            Hi, I'm{" "}
            <motion.span 
              className="text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ 
                duration: 1.2,
                delay: 0.4,
                ease: "easeOut"
              }}
            >
              Ini Karunwi
            </motion.span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-6">
            Product Builder • No-Code Advocate • Community Educator
          </p>
          
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-10">
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
            >
              <a
                href="https://www.linkedin.com/in/inioluwa-karunwi/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Linkedin className="w-5 h-5" />
                <span>LinkedIn</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
            >
              <a
                href="https://medium.com/@ini-karunwi"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <BookOpen className="w-5 h-5" />
                <span>Medium</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
            >
              <a
                href="mailto:ini@example.com"
                className="flex items-center gap-2"
              >
                <Mail className="w-5 h-5" />
                <span>Email Me</span>
              </a>
            </Button>
          </div>

          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight">
            Shipped 50+ no-code products, mentored 1k+ makers, and led product at fast-growing communities.
          </h2>
          
          <p className="text-lg md:text-xl text-muted-foreground/80 leading-relaxed">
            I combine lean, no-code execution with thoughtful product strategy to help teams move from idea to traction quickly.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
