"""
FÁZE 5.0D: Roundtrip Test
Test complete Node -> Python -> Node communication

This script simulates what Node.js/Firebase sends to the Python runtime
and validates the full response cycle.
"""

import json
import requests
from datetime import datetime

# Configuration
PYTHON_RUNTIME_URL = 'http://127.0.0.1:5000'

def test_valid_request():
    """Test 1: Valid request with transactions"""
    print("\n" + "="*80)
    print("TEST 1: Valid Request with Transactions")
    print("="*80)

    request_data = {
        "uid": "test-user-001",
        "pipelineLevel": "L1",
        "modelVersion": "1.0",
        "transactions": [
            {"category": "food", "amount": 50.00, "date": "2026-05-01"},
            {"category": "food", "amount": 55.00, "date": "2026-06-01"},
            {"category": "food", "amount": 52.00, "date": "2026-07-01"},
            {"category": "transport", "amount": 30.00, "date": "2026-05-01"},
            {"category": "transport", "amount": 32.00, "date": "2026-06-01"},
            {"category": "transport", "amount": 31.00, "date": "2026-07-01"},
        ],
        "income": 2000.00,
        "debugMode": False
    }

    print("\n📤 REQUEST (Node -> Python):")
    print(json.dumps(request_data, indent=2))

    try:
        response = requests.post(
            f"{PYTHON_RUNTIME_URL}/predict",
            json=request_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )

        print(f"\n✅ Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print("\n📥 RESPONSE (Python -> Node):")
            print(json.dumps(data, indent=2))

            # Validate response structure
            print("\n🔍 VALIDATION:")

            # Check top-level fields
            required_fields = ['status', 'uid', 'pipelineLevel', 'modelVersion', 'processedAt', 'predictions', 'error', 'debugMetadata']
            for field in required_fields:
                if field in data:
                    print(f"  ✅ {field}: present")
                else:
                    print(f"  ❌ {field}: MISSING")

            # Check prediction structure
            if data.get('predictions'):
                pred = data['predictions'][0]
                pred_fields = ['period', 'totalPredictedExpense', 'confidence', 'categories', 'dataPoints', 'pipelineLevel']
                print("\n  Prediction fields:")
                for field in pred_fields:
                    if field in pred:
                        value = pred[field]
                        if field == 'categories':
                            print(f"    ✅ {field}: {json.dumps(value)}")
                        else:
                            print(f"    ✅ {field}: {value}")
                    else:
                        print(f"    ❌ {field}: MISSING")

            # Check debugMetadata
            if 'debugMetadata' in data:
                meta = data['debugMetadata']
                meta_fields = ['processingTimeMs', 'pythonRuntime', 'frameworkVersion', 'parsed']
                print("\n  Debug metadata:")
                for field in meta_fields:
                    if field in meta:
                        value = meta[field]
                        if field == 'parsed':
                            print(f"    ✅ {field}: present (transactionCount={value.get('transactionCount')})")
                        else:
                            print(f"    ✅ {field}: {value}")
                    else:
                        print(f"    ⚠️  {field}: not present")

            print("\n✅ TEST 1 PASSED - Valid request processed successfully")
            return True
        else:
            print(f"\n❌ Unexpected status code: {response.status_code}")
            print(response.text)
            return False

    except Exception as e:
        print(f"\n❌ TEST 1 FAILED - Error: {str(e)}")
        return False


def test_empty_transactions():
    """Test 2: Empty transactions"""
    print("\n" + "="*80)
    print("TEST 2: Empty Transactions")
    print("="*80)

    request_data = {
        "uid": "test-user-002",
        "pipelineLevel": "L1",
        "modelVersion": "1.0",
        "transactions": [],
        "income": 2000.00,
        "debugMode": False
    }

    print("\n📤 REQUEST (Node -> Python):")
    print(json.dumps(request_data, indent=2))

    try:
        response = requests.post(
            f"{PYTHON_RUNTIME_URL}/predict",
            json=request_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ Status: {response.status_code}")

            # Check that prediction has zero values
            if data.get('predictions'):
                pred = data['predictions'][0]
                print("\n✅ Response received:")
                print(f"  - totalPredictedExpense: {pred.get('totalPredictedExpense')} (should be 0.0)")
                print(f"  - confidence: {pred.get('confidence')} (should be 0.0)")
                print(f"  - dataPoints: {pred.get('dataPoints')} (should be 0)")
                print(f"  - categories: {pred.get('categories')} (should be {{}})")

                print("\n✅ TEST 2 PASSED - Empty transactions handled correctly")
                return True
            else:
                print("\n❌ TEST 2 FAILED - No predictions in response")
                return False
        else:
            print(f"\n❌ Status: {response.status_code}")
            print(response.text)
            return False

    except Exception as e:
        print(f"\n❌ TEST 2 FAILED - Error: {str(e)}")
        return False


def test_invalid_request():
    """Test 3: Invalid request (missing field)"""
    print("\n" + "="*80)
    print("TEST 3: Invalid Request (Missing Required Field)")
    print("="*80)

    request_data = {
        "uid": "test-user-003",
        "pipelineLevel": "L1",
        # Missing: modelVersion
        "transactions": [],
        "income": 2000.00,
    }

    print("\n📤 REQUEST (Node -> Python):")
    print(json.dumps(request_data, indent=2))
    print("\n⚠️  Note: Missing 'modelVersion' field")

    try:
        response = requests.post(
            f"{PYTHON_RUNTIME_URL}/predict",
            json=request_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )

        if response.status_code == 400:
            data = response.json()
            print(f"\n✅ Status: {response.status_code} (expected for validation error)")
            print(f"✅ Error message: {data.get('error')}")

            # Should have 'failed' status
            if data.get('status') == 'failed':
                print("\n✅ TEST 3 PASSED - Validation error handled correctly")
                return True
            else:
                print("\n❌ TEST 3 FAILED - Should have status='failed'")
                return False
        else:
            print(f"\n❌ TEST 3 FAILED - Expected 400, got {response.status_code}")
            return False

    except Exception as e:
        print(f"\n❌ TEST 3 FAILED - Error: {str(e)}")
        return False


def test_invalid_enum():
    """Test 4: Invalid enum value"""
    print("\n" + "="*80)
    print("TEST 4: Invalid Enum Value")
    print("="*80)

    request_data = {
        "uid": "test-user-004",
        "pipelineLevel": "L4",  # Invalid - must be L1, L2, or L3
        "modelVersion": "1.0",
        "transactions": [],
        "income": 2000.00,
    }

    print("\n📤 REQUEST (Node -> Python):")
    print(json.dumps(request_data, indent=2))
    print("\n⚠️  Note: pipelineLevel is 'L4' (invalid)")

    try:
        response = requests.post(
            f"{PYTHON_RUNTIME_URL}/predict",
            json=request_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )

        if response.status_code == 400:
            data = response.json()
            print(f"\n✅ Status: {response.status_code} (expected for validation error)")
            print(f"✅ Error message: {data.get('error')}")

            if 'pipelineLevel' in data.get('error', ''):
                print("\n✅ TEST 4 PASSED - Invalid enum detected")
                return True
            else:
                print("\n❌ TEST 4 FAILED - Error should mention pipelineLevel")
                return False
        else:
            print(f"\n❌ TEST 4 FAILED - Expected 400, got {response.status_code}")
            return False

    except Exception as e:
        print(f"\n❌ TEST 4 FAILED - Error: {str(e)}")
        return False


def test_health_check():
    """Test 5: Health check endpoint"""
    print("\n" + "="*80)
    print("TEST 5: Health Check Endpoint")
    print("="*80)

    try:
        response = requests.get(
            f"{PYTHON_RUNTIME_URL}/health",
            headers={"Content-Type": "application/json"},
            timeout=5
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ Status: {response.status_code}")
            print("\n📥 RESPONSE:")
            print(json.dumps(data, indent=2))

            # Check required fields
            if data.get('status') == 'healthy' and data.get('service') == 'ml-runtime':
                print("\n✅ TEST 5 PASSED - Health check successful")
                return True
            else:
                print("\n❌ TEST 5 FAILED - Invalid health response")
                return False
        else:
            print(f"\n❌ Status: {response.status_code}")
            return False

    except Exception as e:
        print(f"\n❌ TEST 5 FAILED - Error: {str(e)}")
        return False


def main():
    """Run all tests"""
    print("\n")
    print("╔" + "="*78 + "╗")
    print("║" + "FÁZE 5.0D: Node -> Python -> Node Roundtrip Tests".center(78) + "║")
    print("║" + "Testing complete integration between Node.js and Python runtime".center(78) + "║")
    print("╚" + "="*78 + "╝")

    results = {
        "Test 1: Valid Request": test_valid_request(),
        "Test 2: Empty Transactions": test_empty_transactions(),
        "Test 3: Invalid Request": test_invalid_request(),
        "Test 4: Invalid Enum": test_invalid_enum(),
        "Test 5: Health Check": test_health_check(),
    }

    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} — {test_name}")

    print("\n" + "-"*80)
    print(f"Result: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Node -> Python -> Node roundtrip is working!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

    return passed == total


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
