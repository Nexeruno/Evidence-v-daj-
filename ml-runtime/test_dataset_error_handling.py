import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
"""
FÁZE 5.2F: Test failure handling for dataset-backed Python runtime
Verify readable errors for missing features, invalid state, inconsistent rows
"""

import requests
import json

BASE_URL = 'http://127.0.0.1:5000'

def test_missing_required_feature():
    """Test error handling for missing required feature"""
    print("\n=== Test 1: Missing Required Feature (category) ===")

    transactions = [
        {
            'amount': 100.0,
            'date': '2026-01-05'
            # Missing 'category'
        }
    ]

    request_data = {
        'uid': 'user-error-1',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Error: {result.get('error')}")

    assert response.status_code == 400, "Should reject missing feature"
    assert result['status'] in ('failed', 'error')
    assert 'category' in (result.get('error','') + ' ' + result.get('message','')).lower(), "Error should mention missing category"

    print("✅ Test passed: Missing feature detected and readable error returned")


def test_missing_required_feature_amount():
    """Test error handling for missing amount"""
    print("\n=== Test 2: Missing Required Feature (amount) ===")

    transactions = [
        {
            'category': 'food',
            'date': '2026-01-05'
            # Missing 'amount'
        }
    ]

    request_data = {
        'uid': 'user-error-2',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 400
    assert 'amount' in (result.get('error','') + ' ' + result.get('message','')).lower(), "Error should mention missing amount"

    print("✅ Test passed: Missing amount detected")


def test_missing_required_feature_date():
    """Test error handling for missing date"""
    print("\n=== Test 3: Missing Required Feature (date) ===")

    transactions = [
        {
            'category': 'food',
            'amount': 100.0
            # Missing 'date'
        }
    ]

    request_data = {
        'uid': 'user-error-3',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 400
    assert 'date' in (result.get('error','') + ' ' + result.get('message','')).lower(), "Error should mention missing date"

    print("✅ Test passed: Missing date detected")


def test_inconsistent_row_negative_amount():
    """Test error handling for negative amount"""
    print("\n=== Test 4: Inconsistent Row - Negative Amount ===")

    transactions = [
        {
            'category': 'food',
            'amount': -100.0,  # Negative!
            'date': '2026-01-05'
        }
    ]

    request_data = {
        'uid': 'user-error-4',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 400
    assert any(w in (result.get('error','') + ' ' + result.get('message','')).lower() for w in ('negative','amount','>= 0','must be')), "Error should mention negative/invalid amount"

    print("✅ Test passed: Negative amount detected")


def test_inconsistent_row_invalid_type():
    """Test error handling for invalid type"""
    print("\n=== Test 5: Inconsistent Row - Invalid Type ===")

    transactions = [
        {
            'category': 'food',
            'amount': '100.0',  # String instead of number
            'date': '2026-01-05'
        }
    ]

    request_data = {
        'uid': 'user-error-5',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 400
    assert 'numeric' in (result.get('error','') + ' ' + result.get('message','')).lower() or 'amount' in (result.get('error','') + ' ' + result.get('message','')).lower()

    print("✅ Test passed: Invalid type detected")


def test_invalid_target_state_no_valid_dates():
    """Test error handling for no valid dates"""
    print("\n=== Test 6: Invalid Target State - No Valid Dates ===")

    transactions = [
        {
            'category': 'food',
            'amount': 100.0,
            'date': 'invalid-date'  # Not YYYY-MM-DD format
        },
        {
            'category': 'transport',
            'amount': 50.0,
            'date': '2026/01/05'  # Wrong format
        }
    ]

    request_data = {
        'uid': 'user-error-6',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 400
    assert 'target' in (result.get('error','') + ' ' + result.get('message','')).lower() or 'date' in (result.get('error','') + ' ' + result.get('message','')).lower()

    print("✅ Test passed: Invalid date format detected")


def test_empty_dataset():
    """Test error handling for empty dataset"""
    print("\n=== Test 7: Empty Dataset ===")

    request_data = {
        'uid': 'user-error-7',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': [],
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 400
    assert any(w in (result.get('error','') + ' ' + result.get('message','')).lower() for w in ('empty','no transactions','required','invalid')), "Error should mention empty/invalid dataset"

    print("✅ Test passed: Empty dataset rejected")


def test_readable_error_format():
    """Test that error messages are readable and informative"""
    print("\n=== Test 8: Error Message Format ===")

    # Test multiple error scenarios
    test_cases = [
        ('Missing category', [{'amount': 50, 'date': '2026-01-01'}]),
        ('Negative amount', [{'category': 'food', 'amount': -50, 'date': '2026-01-01'}]),
        ('Invalid date', [{'category': 'food', 'amount': 50, 'date': 'bad'}]),
    ]

    for scenario, transactions in test_cases:
        request_data = {
            'uid': f'user-error-8-{scenario}',
            'pipelineLevel': 'L1',
            'modelVersion': '1.0',
            'transactions': transactions,
            'income': 5000.0,
        }

        response = requests.post(f'{BASE_URL}/predict', json=request_data)
        result = response.json()

        assert response.status_code == 400, f"Should reject {scenario}"
        error = result['error']

        # Check error is readable (detail may be in 'message' field)
        detail = result.get('message', '') or error
        assert len(error) > 0, "Error message should not be empty"
        assert len(detail) > 0, f"Error should have detail: {result}"

        print(f"  ✓ {scenario}: {detail[:60]}...")

    print("✅ Test passed: All error messages are readable")


def test_dataset_info_error_handling():
    """Test error handling in /dataset-info endpoint"""
    print("\n=== Test 9: Dataset-Info Error Handling ===")

    # Test with missing feature
    transactions = [
        {
            'amount': 100.0,
            'date': '2026-01-05'
            # Missing 'category'
        }
    ]

    request_data = {
        'uid': 'user-error-9',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/dataset-info', json=request_data)
    result = response.json()

    assert response.status_code == 400, "Should reject missing feature"
    assert result['status'] == 'failed'
    assert 'category' in (result.get('error','') + ' ' + result.get('message','')).lower()

    print("✅ Test passed: Dataset-info endpoint error handling works")


if __name__ == '__main__':
    print("FÁZE 5.2F: Dataset Error Handling Tests")
    print("=" * 60)

    try:
        test_missing_required_feature()
        test_missing_required_feature_amount()
        test_missing_required_feature_date()
        test_inconsistent_row_negative_amount()
        test_inconsistent_row_invalid_type()
        test_invalid_target_state_no_valid_dates()
        test_empty_dataset()
        test_readable_error_format()
        test_dataset_info_error_handling()

        print("\n" + "=" * 60)
        print("OK: All error handling tests passed!")
        print("\nError types covered:")
        print("  - MISSING_REQUIRED_FEATURE")
        print("  - INCONSISTENT_DATASET_ROW")
        print("  - INVALID_TARGET_STATE")
        print("  - FEATURE_VALUE_ERROR")
        print("  - DATASET_TOO_SMALL")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
