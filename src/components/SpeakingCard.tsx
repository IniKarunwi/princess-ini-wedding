import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

interface SpeakingCardProps {
  title: string;
  href: string;
  delay?: number;
}

const SpeakingCard = ({ title, href, delay = 0 }: SpeakingCardProps) => {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.05 }}
      className="bg-card border border-border rounded-2xl p-8 hover:border-primary/50 transition-all duration-300 flex items-center justify-between group"
    >
      <h3 className="text-xl font-bold">{title}</h3>
      <ExternalLink className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform" />
    </motion.a>
  );
};

export default SpeakingCard;
