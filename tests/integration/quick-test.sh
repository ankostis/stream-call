#!/bin/bash
# Quick test runner for stream-call integration tests
# Usage: ./quick-test.sh [test-type]

set -e

echo "🧪 Stream-call Integration Test Suite"
echo "======================================"
echo ""

# Check if extension is built
if [ ! -d "dist" ]; then
    echo "⚠️  Extension not built. Building now..."
    npm run build
    echo ""
fi

TEST_TYPE="${1:-all}"

case "$TEST_TYPE" in
    "local"|"1")
        echo "🧪 Running: Local test page (static HTML)"
        echo "   Validates: Basic stream detection"
        echo ""
        npm run test:integration
        ;;

    "real"|"2")
        echo "🧪 Running: Real stream page test"
        echo "   URL: https://www.ertecho.gr/radio/trito/"
        echo "   Validates: Stream extraction from live site"
        echo ""
        npm run test:integration:real
        ;;

    "options"|"3")
        echo "🧪 Running: Options CRUD test"
        echo "   Validates: Endpoint management UI"
        echo ""
        npm run test:integration:options
        ;;

    "manual"|"4")
        echo "🧪 Manual Testing Setup"
        echo "======================="
        echo ""
        echo "Generating httpbin test configuration..."
        node tests/integration/test-helper.js --generate
        echo ""
        echo "Launching Firefox with extension..."
        echo ""
        npx web-ext run --start-url https://www.ertecho.gr/radio/trito/
        ;;

    "all")
        echo "🧪 Running all automated tests"
        echo ""

        echo "1/3: Local test page..."
        npm run test:integration
        echo ""

        echo "2/3: Real stream page..."
        npm run test:integration:real
        echo ""

        echo "3/3: Options CRUD..."
        npm run test:integration:options
        echo ""

        echo "✅ All automated tests completed!"
        echo ""
        echo "📋 For manual httpbin testing, run:"
        echo "   ./quick-test.sh manual"
        ;;

    "help"|"-h"|"--help")
        echo "Usage: ./quick-test.sh [test-type]"
        echo ""
        echo "Test types:"
        echo "  local, 1     Run local test page (static HTML)"
        echo "  real, 2      Run real stream page test (ertecho.gr)"
        echo "  options, 3   Run options CRUD test"
        echo "  manual, 4    Setup and launch manual testing"
        echo "  all          Run all automated tests (default)"
        echo "  help         Show this help"
        echo ""
        echo "Examples:"
        echo "  ./quick-test.sh              # Run all tests"
        echo "  ./quick-test.sh real         # Test real stream site"
        echo "  ./quick-test.sh manual       # Start manual testing"
        echo ""
        echo "Note: Ensure you've run 'npm install' to get web-ext"
        ;;

    *)
        echo "❌ Unknown test type: $TEST_TYPE"
        echo "   Run './quick-test.sh help' for usage"
        exit 1
        ;;
esac
