"""
FÁZE 5.3A: Test offline evaluation flow for deterministic predictions
Verify dataset splitting, metric calculation, and evaluation reporting
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = 'http://127.0.0.1:5000'

def test_basic_evaluation():
    """Test basic offline evaluation flow"""
    print("\n=== Test 1: Basic Offline Evaluation ===")

    # Create 6-month dataset with consistent pattern
    transactions = []
    base_date = datetime(2026, 1, 1)

    for month in range(6):
        current_month = base_date + timedelta(days=30 * month)
        month_str = current_month.strftime('%Y-%m')

        # Each month: 5 food transactions + 2 transport + 1 utilities
        # Total per month: ~500-600
        for i in range(5):
            transactions.append({
                'category': 'food',
                'amount': 100.0 + (i * 5),  # 100, 105, 110, 115, 120
                'date': f"{month_str}-{(i*5+1):02d}"
            })
        for i in range(2):
            transactions.append({
                'category': 'transport',
                'amount': 75.0 + (i * 10),  # 75, 85
                'date': f"{month_str}-{(25+i*5):02d}"
            })
        transactions.append({
            'category': 'utilities',
            'amount': 100.0,
            'date': f"{month_str}-28"
        })

    request_data = {
        'uid': 'user-eval-1',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate', json=request_data)
    print(f"Status: {response.status_code}")
    result = response.json()

    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert result['status'] == 'success', "Evaluation should succeed"

    # Check structure
    assert 'evaluation' in result
    assert 'dataset' in result['evaluation']
    assert 'train_metrics' in result['evaluation']
    assert 'test_metrics' in result['evaluation']

    # Check dataset split
    dataset_info = result['evaluation']['dataset']
    print(f"Dataset split: {dataset_info['train_rows']} train, {dataset_info['test_rows']} test")
    assert dataset_info['train_rows'] > 0, "Should have training data"
    assert dataset_info['test_rows'] > 0, "Should have test data"
    assert dataset_info['total_rows'] == len(transactions)

    # Check metrics present
    metrics = result['evaluation']['test_metrics']
    print(f"Metrics: MAE={metrics['mae']}, RMSE={metrics['rmse']}, MAPE={metrics['mape']:.1f}%, R²={metrics['r_squared']:.3f}")

    assert 'mae' in metrics
    assert 'rmse' in metrics
    assert 'mape' in metrics
    assert 'r_squared' in metrics

    # Check value ranges
    assert metrics['mae'] >= 0, "MAE should be non-negative"
    assert metrics['rmse'] >= 0, "RMSE should be non-negative"
    assert metrics['mape'] >= 0, "MAPE should be non-negative"
    assert -1 <= metrics['r_squared'] <= 1, "R² should be between -1 and 1"

    print("✅ Test passed: Basic evaluation works correctly")


def test_evaluation_with_inconsistent_spending():
    """Test evaluation with more variable spending"""
    print("\n=== Test 2: Evaluation with Variable Spending ===")

    transactions = []
    base_date = datetime(2026, 1, 1)

    # Create 8 months with varying patterns
    for month in range(8):
        current_month = base_date + timedelta(days=30 * month)
        month_str = current_month.strftime('%Y-%m')

        # Month 0-2: Low spending (~300)
        if month < 3:
            transactions.append({'category': 'food', 'amount': 150.0, 'date': f"{month_str}-01"})
            transactions.append({'category': 'transport', 'amount': 75.0, 'date': f"{month_str}-15"})
            transactions.append({'category': 'utilities', 'amount': 75.0, 'date': f"{month_str}-25"})
        # Month 3-5: Medium spending (~500)
        elif month < 6:
            transactions.append({'category': 'food', 'amount': 250.0, 'date': f"{month_str}-01"})
            transactions.append({'category': 'transport', 'amount': 150.0, 'date': f"{month_str}-15"})
            transactions.append({'category': 'utilities', 'amount': 100.0, 'date': f"{month_str}-25"})
        # Month 6-7: High spending (~700)
        else:
            transactions.append({'category': 'food', 'amount': 350.0, 'date': f"{month_str}-01"})
            transactions.append({'category': 'transport', 'amount': 200.0, 'date': f"{month_str}-15"})
            transactions.append({'category': 'utilities', 'amount': 150.0, 'date': f"{month_str}-25"})

    request_data = {
        'uid': 'user-eval-2',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate', json=request_data)
    result = response.json()

    assert response.status_code == 200
    assert result['status'] == 'success'

    metrics = result['evaluation']['test_metrics']
    print(f"Variable spending metrics: MAE={metrics['mae']}, MAPE={metrics['mape']:.1f}%")

    # With variable spending, metrics might be higher
    assert metrics['mae'] >= 0
    assert metrics['mape'] >= 0

    print("✅ Test passed: Evaluation handles variable spending")


def test_evaluation_predictions_vs_actuals():
    """Test that predictions vs actuals are correctly reported"""
    print("\n=== Test 3: Predictions vs Actuals Reporting ===")

    transactions = []
    base_date = datetime(2026, 1, 1)

    for month in range(4):
        current_month = base_date + timedelta(days=30 * month)
        month_str = current_month.strftime('%Y-%m')

        transactions.append({'category': 'food', 'amount': 100.0, 'date': f"{month_str}-05"})
        transactions.append({'category': 'food', 'amount': 100.0, 'date': f"{month_str}-15"})
        transactions.append({'category': 'transport', 'amount': 50.0, 'date': f"{month_str}-25"})

    request_data = {
        'uid': 'user-eval-3',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate', json=request_data)
    result = response.json()

    assert response.status_code == 200

    pred_vs_actual = result['evaluation']['predictions_vs_actuals']
    print(f"Predictions: {pred_vs_actual['predictions']}")
    print(f"Actuals: {pred_vs_actual['actuals']}")

    assert 'predictions' in pred_vs_actual
    assert 'actuals' in pred_vs_actual

    # Check they have matching months
    pred_months = set(pred_vs_actual['predictions'].keys())
    actual_months = set(pred_vs_actual['actuals'].keys())
    assert pred_months == actual_months, "Predictions and actuals should have same months"

    print("✅ Test passed: Predictions vs actuals correctly reported")


def test_evaluation_insufficient_data():
    """Test error handling for insufficient data"""
    print("\n=== Test 4: Insufficient Data Handling ===")

    # Only 1 month of data (need at least 2 for train/test split)
    transactions = [
        {'category': 'food', 'amount': 100.0, 'date': '2026-01-05'},
        {'category': 'transport', 'amount': 50.0, 'date': '2026-01-15'},
    ]

    request_data = {
        'uid': 'user-eval-4',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate', json=request_data)
    result = response.json()

    assert response.status_code == 400, "Should reject insufficient data"
    assert result['status'] == 'failed'
    assert 'insufficient' in result['error'].lower() or '2 months' in result['error']

    print("✅ Test passed: Insufficient data properly rejected")


def test_train_test_split_ratio():
    """Test that train/test split is approximately 80/20"""
    print("\n=== Test 5: Train/Test Split Ratio ===")

    transactions = []
    base_date = datetime(2026, 1, 1)

    # 10 months of data
    for month in range(10):
        current_month = base_date + timedelta(days=30 * month)
        month_str = current_month.strftime('%Y-%m')

        transactions.append({'category': 'food', 'amount': 100.0, 'date': f"{month_str}-05"})
        transactions.append({'category': 'food', 'amount': 100.0, 'date': f"{month_str}-15"})
        transactions.append({'category': 'transport', 'amount': 50.0, 'date': f"{month_str}-25"})

    request_data = {
        'uid': 'user-eval-5',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate', json=request_data)
    result = response.json()

    assert response.status_code == 200

    dataset = result['evaluation']['dataset']
    total = dataset['total_rows']
    train = dataset['train_rows']
    test = dataset['test_rows']

    print(f"Split: {train}/{total} train ({train/total*100:.1f}%), {test}/{total} test ({test/total*100:.1f}%)")

    # Should be approximately 80/20
    train_ratio = train / total
    assert 0.75 <= train_ratio <= 0.85, "Train ratio should be approximately 80%"

    print("✅ Test passed: Train/test split is approximately 80/20")


def test_metrics_explanation():
    """Test that metrics include explanations"""
    print("\n=== Test 6: Metrics Explanations ===")

    transactions = []
    base_date = datetime(2026, 1, 1)

    for month in range(5):
        current_month = base_date + timedelta(days=30 * month)
        month_str = current_month.strftime('%Y-%m')

        transactions.append({'category': 'food', 'amount': 100.0, 'date': f"{month_str}-05"})
        transactions.append({'category': 'transport', 'amount': 50.0, 'date': f"{month_str}-25"})

    request_data = {
        'uid': 'user-eval-6',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/evaluate', json=request_data)
    result = response.json()

    assert response.status_code == 200

    explanations = result['debugMetadata']['metric_explanations']
    print(f"Metric explanations: {json.dumps(explanations, indent=2)}")

    assert 'mae' in explanations
    assert 'rmse' in explanations
    assert 'mape' in explanations
    assert 'r_squared' in explanations

    # Check descriptions are non-empty
    for metric, desc in explanations.items():
        assert len(desc) > 0, f"Explanation for {metric} should not be empty"

    print("✅ Test passed: Metrics include explanations")


if __name__ == '__main__':
    print("FÁZE 5.3A: Offline Evaluation Tests")
    print("=" * 60)

    try:
        test_basic_evaluation()
        test_evaluation_with_inconsistent_spending()
        test_evaluation_predictions_vs_actuals()
        test_evaluation_insufficient_data()
        test_train_test_split_ratio()
        test_metrics_explanation()

        print("\n" + "=" * 60)
        print("✅ All offline evaluation tests passed!")
        print("\nEvaluation metrics supported:")
        print("  - MAE (Mean Absolute Error)")
        print("  - RMSE (Root Mean Squared Error)")
        print("  - MAPE (Mean Absolute Percentage Error)")
        print("  - R² (Coefficient of Determination)")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
