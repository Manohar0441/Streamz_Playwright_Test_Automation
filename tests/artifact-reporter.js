// Small custom reporter so the terminal output actually tells you where to
// find the evidence for each test, instead of just pass/fail. Playwright
// writes a screenshot, and on failure a video and always a trace, into
// test-results/ - this just prints the paths after every test so you don't
// have to go dig through that folder by hand.
//
// Wired in via playwright.config.js -> reporter: [..., './tests/artifact-reporter.js']

class ArtifactReporter {
  onTestEnd(test, result) {
    const fullName = test.titlePath().filter(Boolean).join(' > ');
    console.log(`\n  [${result.status.toUpperCase()}] ${fullName} (${result.duration}ms)`);

    if (result.attachments.length === 0) {
      console.log('     no attachments for this test');
      return;
    }

    for (const attachment of result.attachments) {
      const location = attachment.path || `inline (${attachment.contentType})`;
      console.log(`     ${attachment.name}: ${location}`);
    }
  }

  onEnd(result) {
    console.log(`\n  Test run finished: ${result.status}`);
    console.log('  Full report:  npx playwright show-report');
    console.log('  One trace:    npx playwright show-trace <path-to-trace.zip>\n');
  }
}

module.exports = ArtifactReporter;
