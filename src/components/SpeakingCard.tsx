import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SpeakingCardProps {
  title: string;
  description: string;
  href: string;
  delay?: number;
  image?: string;
}

const SpeakingCard = ({ title, description, href, delay = 0, image }: SpeakingCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ 
        y: -6,
        boxShadow: "0 0 20px rgba(159, 255, 96, 0.2)"
      }}
      className="bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition-all duration-300 flex flex-col h-full group"
    >
      <div className="flex-1">
        <div className="bg-secondary rounded-lg h-40 mb-4 flex items-center justify-center overflow-hidden">
          {image ? (
            <img src={image} alt={title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-6xl">🎤</span>
          )}
        </div>
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm mb-4">{description}</p>
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" className="w-full group/btn hover:bg-primary hover:text-primary-foreground">
          View Event
          <ExternalLink className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
        </Button>
      </a>
    </motion.div>
  );
};

export default SpeakingCard;
