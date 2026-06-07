"""
FÁZE 5.3D: Test failure reason analysis in evaluation
Verify top failure reasons are correctly identified and reported
"""

import requests
import json

BASE_URL = 'http://127.0.0.1:5000'

def test_failure_reason_detection():
    """Test detection of various failure reasons"""
    print("\n=== Test 1: Failure Reason Detection ===")

    transactions = [
        {'category': 'food', 'amount': 100.0, 'date': '2026-01-05'},      # Success
        {'category': 'food', 'amount': 100.0, 'date': '2026-01-15'},      # Success
        {'amount': 100.0, 'date': '2026-02-05'},                          # Missing category
        {'category': 'transport', 'date': '2026-02-15'},                  # Missing amount
        {'category': '', 'amount': 50.0, 'date': '2026-03-05'},           # Empty category
        {'category': 'food', 'amount': -50.0, 'date': '2026-03-15'},      # Negative amount
        {'category': 'food', 'amount': 75.0, 'date': '2026-04-05'},       # Success
        {'category': 'food', 'amount': 'invalid', 'date': '2026-04-15'},  # Invalid amount type
    ]

    request_data = {
        'uid': 'user-debug-1',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate-summary', json=request_data)
    result = response.json()

    assert response.status_code == 200

    # Check debug summary
    debug_summary = result['evaluation']['debug_summary']
    print(f"Debug Summary: {json.dumps(debug_summary, indent=2)}")

    # Check structure
    assert 'top_failure_reasons' in debug_summary
    assert 'failure_reason_count' in debug_summary

    # Check reasons
    failure_reasons = debug_summary['top_failure_reasons']
    print(f"Failure Reasons: {failure_reasons}")

    # Should identify multiple reasons
    assert 'missing_category' in failure_reasons
    assert 'missing_amount' in failure_reasons
    assert 'empty_category' in failure_reasons
    assert 'negative_amount' in failure_reasons
    assert 'invalid_amount_type' in failure_reasons

    print("✅ Test passed: Failure reasons correctly detected")


def test_failure_reason_counts():
    """Test that failure reason counts are accurate"""
    print("\n=== Test 2: Failure Reason Counts ===")

    transactions = [
        # 3x missing_amount
        {'category': 'food', 'date': '2026-01-05'},
        {'category': 'food', 'date': '2026-01-15'},
        {'category': 'food', 'date': '2026-02-05'},
        # 2x missing_category
        {'amount': 100.0, 'date': '2026-02-15'},
        {'amount': 100.0, 'date': '2026-03-05'},
        # 1x empty_category
        {'category': '', 'amount': 50.0, 'date': '2026-03-15'},
        # 1x successful
        {'category': 'food', 'amount': 100.0, 'date': '2026-04-05'},
    ]

    request_data = {
        'uid': 'user-debug-2',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate-summary', json=request_data)
    result = response.json()

    failure_reasons = result['evaluation']['debug_summary']['top_failure_reasons']
    print(f"Failure Reasons: {json.dumps(failure_reasons, indent=2)}")

    # Check counts
    assert failure_reasons.get('missing_amount') == 3
    assert failure_reasons.get('missing_category') == 2
    assert failure_reasons.get('empty_category') == 1

    print("✅ Test passed: Failure reason counts are accurate")


def test_no_failures():
    """Test debug summary when all rows are valid"""
    print("\n=== Test 3: No Failures ===")

    transactions = [
        {'category': 'food', 'amount': 100.0, 'date': '2026-01-05'},
        {'category': 'food', 'amount': 100.0, 'date': '2026-01-15'},
        {'category': 'transport', 'amount': 50.0, 'date': '2026-02-05'},
    ]

    request_data = {
        'uid': 'user-debug-3',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate-summary', json=request_data)
    result = response.json()

    debug_summary = result['evaluation']['debug_summary']
    print(f"Debug Summary: {json.dumps(debug_summary, indent=2)}")

    # When all succeed, should have empty reasons
    assert debug_summary['top_failure_reasons'] == {}
    assert debug_summary['failure_reason_count'] == 0

    print("✅ Test passed: Empty failure reasons when all succeed")


def test_top_5_reasons_limit():
    """Test that only top 5 reasons are returned"""
    print("\n=== Test 4: Top 5 Reasons Limit ===")

    transactions = []

    # Create 10+ different failure reasons (but only top 5 should be returned)
    for i in range(3):
        transactions.append({'amount': 100.0, 'date': '2026-01-0{}'.format(i+1)})  # missing_category
    for i in range(3):
        transactions.append({'category': 'food', 'date': '2026-01-0{}'.format(i+4)})  # missing_amount
    for i in range(2):
        transactions.append({'category': '', 'amount': 50.0, 'date': '2026-01-0{}'.format(i+7)})  # empty_category
    for i in range(2):
        transactions.append({'category': 'food', 'amount': -50.0, 'date': '2026-01-0{}'.format(i+9)})  # negative_amount
    for i in range(1):
        transactions.append({'category': 'food', 'amount': 'text', 'date': '2026-02-01'})  # invalid_amount_type
    for i in range(1):
        transactions.append({'category': 123, 'amount': 50.0, 'date': '2026-02-02'})  # invalid_category_type
    # Success row
    transactions.append({'category': 'food', 'amount': 100.0, 'date': '2026-02-03'})

    request_data = {
        'uid': 'user-debug-4',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate-summary', json=request_data)
    result = response.json()

    failure_reasons = result['evaluation']['debug_summary']['top_failure_reasons']
    failure_count = result['evaluation']['debug_summary']['failure_reason_count']

    print(f"Failure Reasons (top {failure_count}): {json.dumps(failure_reasons, indent=2)}")

    # Should have at most 5 reasons
    assert len(failure_reasons) <= 5
    assert failure_count <= 5

    print("✅ Test passed: Limited to top 5 reasons")


def test_readable_failure_summary():
    """Test that failure summary is readable and actionable"""
    print("\n=== Test 5: Readable Failure Summary ===")

    transactions = [
        {'category': 'food', 'amount': 100.0, 'date': '2026-01-05'},      # Success
        {'amount': 100.0, 'date': '2026-01-15'},                          # Missing category (x2)
        {'amount': 100.0, 'date': '2026-02-05'},
        {'category': 'food', 'date': '2026-02-15'},                       # Missing amount
        {'category': '', 'amount': 50.0, 'date': '2026-03-05'},           # Empty category
    ]

    request_data = {
        'uid': 'user-debug-5',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate-summary', json=request_data)
    result = response.json()

    debug_summary = result['evaluation']['debug_summary']
    comparison = result['evaluation']['comparison']

    # Readable output
    print(f"\nEvaluation Summary:")
    print(f"  Total rows: {result['evaluation']['summary']['total_row_count']}")
    print(f"  ✓ Usable: {comparison['usable_output_rows']} ({comparison['success_rate']}%)")
    print(f"  ✗ Errors: {comparison['error_rows']} ({comparison['error_rate']}%)")
    print(f"\nTop Failure Reasons:")
    for reason, count in debug_summary['top_failure_reasons'].items():
        print(f"  - {reason}: {count}")

    # Verify structure is present
    assert debug_summary['failure_reason_count'] > 0
    assert len(debug_summary['top_failure_reasons']) > 0

    print("\n✅ Test passed: Failure summary is readable")


def test_failure_reasons_match_error_count():
    """Test that total failure reasons = error_rows"""
    print("\n=== Test 6: Failure Reasons Match Error Count ===")

    transactions = [
        {'category': 'food', 'amount': 100.0, 'date': '2026-01-05'},      # Success
        {'amount': 100.0, 'date': '2026-01-15'},                          # Error 1
        {'amount': 100.0, 'date': '2026-02-05'},                          # Error 2
        {'category': 'food', 'date': '2026-02-15'},                       # Error 3
        {'category': '', 'amount': 50.0, 'date': '2026-03-05'},           # Error 4
    ]

    request_data = {
        'uid': 'user-debug-6',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate-summary', json=request_data)
    result = response.json()

    error_rows = result['evaluation']['comparison']['error_rows']
    failure_reasons = result['evaluation']['debug_summary']['top_failure_reasons']
    total_reasons = sum(failure_reasons.values())

    print(f"Error rows: {error_rows}")
    print(f"Total failure reasons: {total_reasons}")

    # Total reasons should match error count
    assert total_reasons == error_rows

    print("✅ Test passed: Failure reasons match error count")


if __name__ == '__main__':
    print("FÁZE 5.3D: Failure Reason Analysis Tests")
    print("=" * 60)

    try:
        test_failure_reason_detection()
        test_failure_reason_counts()
        test_no_failures()
        test_top_5_reasons_limit()
        test_readable_failure_summary()
        test_failure_reasons_match_error_count()

        print("\n" + "=" * 60)
        print("✅ All failure reason analysis tests passed!")
        print("\nFailure Reasons Tracked:")
        print("  - missing_category: Category field not provided")
        print("  - missing_amount: Amount field not provided")
        print("  - missing_date: Date field not provided")
        print("  - empty_category: Category is empty string")
        print("  - empty_date: Date is empty string")
        print("  - negative_amount: Amount is less than 0")
        print("  - invalid_category_type: Category is not string")
        print("  - invalid_amount_type: Amount is not numeric")
        print("  - invalid_date_type: Date is not string")
        print("  - not_a_dict: Row is not a dictionary")
        print("\nTop 5 reasons returned for debugging")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
