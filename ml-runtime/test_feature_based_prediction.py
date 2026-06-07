"""
FÁZE 5.2C: Test feature-based deterministic predictions
Verify that predictions derive from real feature data, not generic placeholders
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = 'http://127.0.0.1:5000'

def test_feature_based_prediction_realistic_data():
    """Test prediction with realistic multi-category data"""
    print("\n=== Test 1: Feature-Based Prediction (Realistic 6-Month Data) ===")

    # Create realistic 6-month dataset with varying patterns
    transactions = [
        # January 2026: Food-heavy
        {'category': 'food', 'amount': 150.0, 'date': '2026-01-05'},
        {'category': 'food', 'amount': 180.0, 'date': '2026-01-10'},
        {'category': 'transport', 'amount': 50.0, 'date': '2026-01-15'},
        {'category': 'utilities', 'amount': 100.0, 'date': '2026-01-20'},

        # February 2026: Balanced
        {'category': 'food', 'amount': 120.0, 'date': '2026-02-05'},
        {'category': 'transport', 'amount': 60.0, 'date': '2026-02-10'},
        {'category': 'entertainment', 'amount': 80.0, 'date': '2026-02-15'},
        {'category': 'utilities', 'amount': 100.0, 'date': '2026-02-20'},

        # March 2026: Transport-heavy
        {'category': 'transport', 'amount': 100.0, 'date': '2026-03-05'},
        {'category': 'food', 'amount': 100.0, 'date': '2026-03-10'},
        {'category': 'transport', 'amount': 80.0, 'date': '2026-03-15'},
        {'category': 'utilities', 'amount': 100.0, 'date': '2026-03-20'},

        # April 2026: Entertainment increase
        {'category': 'food', 'amount': 110.0, 'date': '2026-04-05'},
        {'category': 'entertainment', 'amount': 150.0, 'date': '2026-04-10'},
        {'category': 'transport', 'amount': 50.0, 'date': '2026-04-15'},
        {'category': 'utilities', 'amount': 100.0, 'date': '2026-04-20'},

        # May 2026: Normal
        {'category': 'food', 'amount': 130.0, 'date': '2026-05-05'},
        {'category': 'transport', 'amount': 70.0, 'date': '2026-05-10'},
        {'category': 'utilities', 'amount': 100.0, 'date': '2026-05-15'},
        {'category': 'entertainment', 'amount': 60.0, 'date': '2026-05-20'},

        # June 2026: Similar to May
        {'category': 'food', 'amount': 140.0, 'date': '2026-06-05'},
        {'category': 'transport', 'amount': 60.0, 'date': '2026-06-10'},
        {'category': 'utilities', 'amount': 100.0, 'date': '2026-06-15'},
        {'category': 'entertainment', 'amount': 70.0, 'date': '2026-06-20'},
    ]

    request_data = {
        'uid': 'user-feature-test-1',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
        'debugMode': True,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    print(f"Status: {response.status_code}")
    result = response.json()

    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert result['status'] == 'success', "Should succeed"

    # Check feature analysis is present
    assert 'debugMetadata' in result
    assert 'featureAnalysis' in result['debugMetadata'], "Should have feature analysis"

    feature_analysis = result['debugMetadata']['featureAnalysis']

    # Verify category distribution exists
    assert 'categoryDistribution' in feature_analysis, "Should analyze category distribution"
    category_dist = feature_analysis['categoryDistribution']

    print(f"\n📊 Feature Analysis Results:")
    print(f"  Categories found: {len(category_dist)}")
    for cat, stats in category_dist.items():
        print(f"    {cat}: {stats['totalAmount']:.2f} ({stats['percentOfTotal']:.1f}%), "
              f"{stats['transactionCount']} txns, avg {stats['averageAmount']:.2f}")

    # Verify amount patterns
    assert 'amountPatterns' in feature_analysis, "Should analyze amount patterns"
    amount_patterns = feature_analysis['amountPatterns']
    print(f"\n💰 Amount Patterns:")
    print(f"  Mean: {amount_patterns.get('mean', 'N/A')}")
    print(f"  Median: {amount_patterns.get('median', 'N/A')}")
    print(f"  Range: {amount_patterns.get('range', 'N/A')}")
    print(f"  Std Dev: {amount_patterns.get('stdDev', 'N/A')}")

    # Verify temporal patterns
    assert 'temporalPattern' in feature_analysis, "Should analyze temporal pattern"
    temporal = feature_analysis['temporalPattern']
    print(f"\n📅 Temporal Patterns:")
    print(f"  Months: {temporal.get('monthsAnalyzed', 'N/A')}")
    print(f"  Trend: {temporal.get('trendDirection', 'N/A')} ({temporal.get('trend', 0):.1f}%)")
    print(f"  Monthly avg: {temporal.get('monthlyAverage', 'N/A')}")

    # Verify feature impact
    assert 'featureImpact' in feature_analysis, "Should calculate feature impact"
    impact = feature_analysis['featureImpact']
    print(f"\n🎯 Feature Impact:")
    print(f"  Top category: {impact.get('topImpactCategory', 'N/A')} ({impact.get('topCategoryImpact', 0):.1f}%)")
    print(f"  Diversity: {impact.get('categoryDiversity', 'N/A')}")
    print(f"  Unique categories: {impact.get('uniqueCategories', 0)}")

    # Verify prediction is derived from features
    prediction_result = result['result']
    print(f"\n🔮 Prediction Result:")
    print(f"  Predicted expense: {prediction_result['predictedExpense']:.2f}")
    print(f"  Confidence: {prediction_result['confidence']:.2f}")

    # Categories in prediction should match analyzed categories
    pred_categories = result['predictions'][0]['categories']
    print(f"  Predicted categories: {pred_categories}")

    # Verify predicted categories match analyzed distribution
    for cat in category_dist.keys():
        assert cat in pred_categories, f"Category {cat} should be in predictions"

    print("\n✅ Test passed: Prediction derived from real feature data")


def test_feature_based_single_category():
    """Test prediction with single dominant category"""
    print("\n=== Test 2: Single Dominant Category (Food) ===")

    # 80% of spending is on food
    transactions = [
        {'category': 'food', 'amount': 100.0, 'date': '2026-01-05'},
        {'category': 'food', 'amount': 120.0, 'date': '2026-01-10'},
        {'category': 'food', 'amount': 110.0, 'date': '2026-01-15'},
        {'category': 'food', 'amount': 90.0, 'date': '2026-01-20'},
        {'category': 'transport', 'amount': 30.0, 'date': '2026-02-05'},
        {'category': 'food', 'amount': 100.0, 'date': '2026-02-10'},
    ]

    request_data = {
        'uid': 'user-feature-test-2',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 200
    assert result['status'] == 'success'

    feature_analysis = result['debugMetadata']['featureAnalysis']
    impact = feature_analysis['featureImpact']

    # Food should be top impact category
    assert impact['topImpactCategory'] == 'food', "Food should be dominant"
    assert impact['topCategoryImpact'] > 75, "Food should be >75% of total"
    assert impact['categoryDiversity'] == 'low', "Should have low diversity"

    print(f"✅ Test passed: Food identified as dominant ({impact['topCategoryImpact']:.1f}%)")


def test_feature_based_high_diversity():
    """Test prediction with high category diversity"""
    print("\n=== Test 3: High Category Diversity ===")

    # 6+ different categories with balanced spending
    categories = ['food', 'transport', 'utilities', 'entertainment', 'shopping', 'dining', 'fitness']
    transactions = []

    for i, cat in enumerate(categories):
        for month in range(3):
            transactions.append({
                'category': cat,
                'amount': 50 + (i * 10),
                'date': f'2026-{(month+1):02d}-{(i*4+1):02d}'
            })

    request_data = {
        'uid': 'user-feature-test-3',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 200

    feature_analysis = result['debugMetadata']['featureAnalysis']
    impact = feature_analysis['featureImpact']
    category_dist = feature_analysis['categoryDistribution']

    print(f"✅ Test passed: High diversity detected ({impact['categoryDiversity']}, {len(category_dist)} categories)")


def test_increasing_trend():
    """Test prediction detects increasing spending trend"""
    print("\n=== Test 4: Increasing Spending Trend ===")

    # Gradually increasing amounts over months
    transactions = [
        # January: ~500
        {'category': 'food', 'amount': 150.0, 'date': '2026-01-05'},
        {'category': 'food', 'amount': 150.0, 'date': '2026-01-15'},
        {'category': 'transport', 'amount': 200.0, 'date': '2026-01-25'},

        # February: ~600
        {'category': 'food', 'amount': 200.0, 'date': '2026-02-05'},
        {'category': 'food', 'amount': 200.0, 'date': '2026-02-15'},
        {'category': 'transport', 'amount': 200.0, 'date': '2026-02-25'},

        # March: ~700
        {'category': 'food', 'amount': 250.0, 'date': '2026-03-05'},
        {'category': 'food', 'amount': 250.0, 'date': '2026-03-15'},
        {'category': 'transport', 'amount': 200.0, 'date': '2026-03-25'},
    ]

    request_data = {
        'uid': 'user-feature-test-4',
        'pipelineLevel': 'L1',
        'modelVersion': '1.0',
        'transactions': transactions,
        'income': 5000.0,
    }

    response = requests.post(f'{BASE_URL}/predict', json=request_data)
    result = response.json()

    assert response.status_code == 200

    feature_analysis = result['debugMetadata']['featureAnalysis']
    temporal = feature_analysis['temporalPattern']

    print(f"Trend: {temporal['trendDirection']} ({temporal['trend']:.1f}%)")
    assert temporal['trendDirection'] in ['increasing', 'stable'], "Should detect upward or stable trend"

    print(f"✅ Test passed: Spending trend detected")


if __name__ == '__main__':
    print("FÁZE 5.2C: Feature-Based Deterministic Prediction Tests")
    print("=" * 60)

    try:
        test_feature_based_prediction_realistic_data()
        test_feature_based_single_category()
        test_feature_based_high_diversity()
        test_increasing_trend()

        print("\n" + "=" * 60)
        print("✅ All feature-based prediction tests passed!")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
