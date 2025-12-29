import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Play, CheckCircle, XCircle, Loader2, FlaskConical, Mic } from 'lucide-react';
import { runE2ETest } from '@/tests/e2e-flow.test';
import { runVoiceRecordingTests, VoiceTestResult } from '@/tests/useVoiceRecording.test';

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
}

export default function TestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [completed, setCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState('e2e');
  
  // Voice recording tests state
  const [voiceRunning, setVoiceRunning] = useState(false);
  const [voiceResults, setVoiceResults] = useState<VoiceTestResult[]>([]);
  const [voiceCompleted, setVoiceCompleted] = useState(false);

  const handleRunTest = async () => {
    setRunning(true);
    setResults([]);
    setCompleted(false);

    try {
      const testResults = await runE2ETest();
      setResults(testResults);
    } catch (error: any) {
      setResults([{
        step: 'Test Execution',
        success: false,
        message: error.message,
      }]);
    } finally {
      setRunning(false);
      setCompleted(true);
    }
  };

  const handleRunVoiceTests = async () => {
    setVoiceRunning(true);
    setVoiceResults([]);
    setVoiceCompleted(false);

    try {
      const testResults = await runVoiceRecordingTests();
      setVoiceResults(testResults);
    } catch (error: any) {
      setVoiceResults([{
        name: 'Test Execution',
        passed: false,
        message: error.message,
      }]);
    } finally {
      setVoiceRunning(false);
      setVoiceCompleted(true);
    }
  };

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  const voicePassed = voiceResults.filter(r => r.passed).length;
  const voiceFailed = voiceResults.filter(r => !r.passed).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center h-14 px-4 gap-4">
          <Link to="/owner/spaces">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-display font-bold">Test Runner</h1>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="e2e" className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              E2E Tests
            </TabsTrigger>
            <TabsTrigger value="voice" className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Voice Recording
            </TabsTrigger>
          </TabsList>

          <TabsContent value="e2e" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display">End-to-End Test Suite</CardTitle>
                <CardDescription>
                  Tests the complete flow: Create space → Upload document → Create share link → Test chat → Verify analytics → Cleanup
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleRunTest} 
                  disabled={running}
                  className="gradient-primary text-primary-foreground"
                >
                  {running ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running Tests...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run E2E Test
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {results.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center justify-between">
                    <span>Test Results</span>
                    {completed && (
                      <span className={`text-sm font-normal ${failed === 0 ? 'text-success' : 'text-destructive'}`}>
                        {passed} passed, {failed} failed
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {results.map((result, index) => (
                    <div 
                      key={index}
                      className={`flex items-start gap-3 p-3 rounded-lg ${
                        result.success ? 'bg-success/10' : 'bg-destructive/10'
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{result.step}</p>
                        <p className="text-sm text-muted-foreground">{result.message}</p>
                        {result.data && (
                          <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-x-auto">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="voice" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Voice Recording Unit Tests</CardTitle>
                <CardDescription>
                  Tests audio level monitoring, duration tracking, chunked processing, and waveform visualization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleRunVoiceTests} 
                  disabled={voiceRunning}
                  className="gradient-primary text-primary-foreground"
                >
                  {voiceRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running Tests...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Voice Tests
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {voiceResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center justify-between">
                    <span>Test Results</span>
                    {voiceCompleted && (
                      <span className={`text-sm font-normal ${voiceFailed === 0 ? 'text-success' : 'text-destructive'}`}>
                        {voicePassed} passed, {voiceFailed} failed
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {voiceResults.map((result, index) => (
                    <div 
                      key={index}
                      className={`flex items-start gap-3 p-3 rounded-lg ${
                        result.passed ? 'bg-success/10' : 'bg-destructive/10'
                      }`}
                    >
                      {result.passed ? (
                        <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{result.name}</p>
                        <p className="text-sm text-muted-foreground">{result.message}</p>
                        {result.error && (
                          <p className="text-xs text-destructive mt-1">Error: {result.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}