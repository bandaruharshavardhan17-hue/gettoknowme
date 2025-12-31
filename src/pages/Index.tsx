import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, FileText, Share2, MessageCircle } from 'lucide-react';

export default function Index() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/20">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <div className="container px-4 py-16 relative">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-6 animate-fade-in">
            <Sparkles className="w-4 h-4" />
            AI-Powered Knowledge Sharing
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold mb-6 animate-fade-in" style={{ animationDelay: '100ms' }}>
            <span className="gradient-text">Speak2MyAI</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 animate-fade-in" style={{ animationDelay: '200ms' }}>
            Upload your documents, create knowledge spaces, and let anyone ask questions. 
            Powered by AI that answers based on your content.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in" style={{ animationDelay: '300ms' }}>
            <Link to="/login">
              <Button size="lg" className="gradient-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity">
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            { icon: FileText, title: 'Upload Documents', desc: 'Add PDFs, text files, or write notes directly' },
            { icon: Share2, title: 'Share Instantly', desc: 'Create links anyone can use to chat with your knowledge' },
            { icon: MessageCircle, title: 'AI-Powered Chat', desc: 'Answers come from your documents, with citations' },
          ].map((feature, i) => (
            <div 
              key={feature.title}
              className="p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 text-center animate-fade-in hover:shadow-lg transition-shadow"
              style={{ animationDelay: `${400 + i * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mx-auto mb-4">
                <feature.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="font-display font-bold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
